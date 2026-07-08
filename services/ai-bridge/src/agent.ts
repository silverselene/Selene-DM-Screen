import {
  query,
  type SDKUserMessage,
  type McpServerConfig,
} from "@anthropic-ai/claude-agent-sdk";
import { config } from "./config";
import { ALLOWED_TOOL_SET, MCP_SERVER_NAME } from "./ddbTools";
import { resolveAuth, type ResolvedAuth } from "./auth";

const SYSTEM_PROMPT = `You are Selene, an assistant embedded in a Dungeon Master's dashboard for Dungeons & Dragons 5.5e (the 2024 rules). You help the DM at the table: answer rules questions, look up monsters, spells, and player characters, and reason about encounters.

You have READ-ONLY access to the DM's own D&D Beyond content through the "dndbeyond" tools (characters, party, monsters, spells, equipment, rules, conditions, owned rulebooks, and encounter helpers). Use them only when the DM asks about live or account-specific data — a specific player's character sheet, a homebrew monster, or content from a rulebook they own. For general rules the DM would already know, answer directly and concisely.

You cannot modify anything on D&D Beyond and have no access to the local filesystem. Never claim to have changed D&D Beyond state. Keep answers tight and table-ready; the DM is mid-session.`;

/** Events streamed back to the HTTP layer for one chat turn. */
export type BridgeEvent =
  | { type: "text"; text: string }
  | { type: "tool"; name: string }
  | {
      type: "done";
      result: string;
      subtype: string;
      usage?: unknown;
      costUsd?: number;
      sessionId?: string;
    }
  | { type: "error"; message: string };

function authAwareError(err: unknown, auth: ResolvedAuth): string {
  const msg = err instanceof Error ? err.message : String(err);
  const looksLikeAuth = /auth|api key|api_key|credential|401|unauthor|login/i.test(msg);
  if (looksLikeAuth && auth.mode === "subscription") {
    return (
      `${msg}\n\nThe bridge is in subscription mode. Ensure you are logged in with the ` +
      `\`claude\` CLI, or run \`claude setup-token\` and export CLAUDE_CODE_OAUTH_TOKEN. ` +
      `(To use a metered API key instead, set AI_BRIDGE_ALLOW_API_KEY=1 and ANTHROPIC_API_KEY.)`
    );
  }
  return msg;
}

/**
 * Run a single chat turn against Claude with ddb-mcp attached, yielding typed
 * events.
 *
 * Security gate: `canUseTool` is the single permission authority — it allows a
 * call only if the tool is in the read-only ddb allowlist, and denies everything
 * else (the excluded destructive/browser ddb tools AND every built-in
 * filesystem/exec tool). We intentionally do NOT list the ddb tools in
 * `allowedTools`: a bare `allowedTools` entry auto-approves a tool *before*
 * `canUseTool` is consulted (the SDK's CAN_USE_TOOL_SHADOWED warning), which
 * would split enforcement. Routing every call through `canUseTool` keeps one
 * auditable gate.
 */
export async function* runChatTurn(
  message: string,
  abortController?: AbortController,
): AsyncGenerator<BridgeEvent> {
  const auth = resolveAuth();

  // canUseTool requires streaming-input mode (prompt as an async iterable).
  async function* promptStream(): AsyncGenerator<SDKUserMessage> {
    yield {
      type: "user",
      message: { role: "user", content: message },
      parent_tool_use_id: null,
    };
  }

  // Attach ddb-mcp only if its entrypoint resolved (the bundled npm package, or
  // a DDB_MCP_ENTRY override). If it didn't, the bridge still answers general
  // rules questions from the model's knowledge — it just can't do live lookups.
  const mcpServers: Record<string, McpServerConfig> = {};
  if (config.ddbMcpEntry) {
    mcpServers[MCP_SERVER_NAME] = {
      command: "node",
      args: [config.ddbMcpEntry],
    };
  }

  try {
    const response = query({
      prompt: promptStream(),
      options: {
        ...(config.model ? { model: config.model } : {}),
        systemPrompt: SYSTEM_PROMPT,
        // Hermetic: don't load this repo's CLAUDE.md, skills, or .mcp.json.
        settingSources: [],
        mcpServers,
        canUseTool: async (toolName, input) =>
          ALLOWED_TOOL_SET.has(toolName)
            ? { behavior: "allow", updatedInput: input }
            : {
                behavior: "deny",
                message:
                  `Tool "${toolName}" is not permitted by the AI bridge. ` +
                  `Only read-only D&D Beyond lookups are available.`,
              },
        // Safety cap on tool-calling loops for a single turn.
        maxTurns: 12,
        env: auth.env,
        // Aborts the in-flight turn (and its ddb-mcp subprocess calls) when the
        // HTTP client disconnects, so a cancelled request stops spending the
        // subscription instead of running to completion for a discarded reply.
        ...(abortController ? { abortController } : {}),
      },
    });

    for await (const m of response) {
      if (m.type === "assistant") {
        for (const block of m.message.content) {
          if (block.type === "text" && block.text) {
            yield { type: "text", text: block.text };
          } else if (block.type === "tool_use") {
            yield { type: "tool", name: block.name };
          }
        }
      } else if (m.type === "result") {
        yield {
          type: "done",
          subtype: m.subtype,
          result: m.subtype === "success" ? m.result : `(${m.subtype})`,
          usage: m.usage,
          costUsd: m.total_cost_usd,
          sessionId: m.session_id,
        };
      }
    }
  } catch (err) {
    yield { type: "error", message: authAwareError(err, auth) };
  }
}
