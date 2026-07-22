import {
  query,
  type SDKUserMessage,
  type McpServerConfig,
} from "@anthropic-ai/claude-agent-sdk";
import type { BridgeEvent, EffortLevel } from "@workspace/bridge-protocol";
import { config } from "./config";
import { ALLOWED_TOOL_SET, MCP_SERVER_NAME, bareToolName } from "./ddbTools";
import { parseToolResult, extractToolResultText } from "./toolResults";
import { resolveAuth, type ResolvedAuth } from "./auth";

const SYSTEM_PROMPT = `You are Selene, an assistant embedded in a Dungeon Master's dashboard for Dungeons & Dragons 5.5e (the 2024 rules). You help the DM at the table: answer rules questions, look up monsters, spells, and player characters, and reason about encounters.

You have READ-ONLY access to the DM's own D&D Beyond content through the "dndbeyond" tools (characters, party, monsters, spells, equipment, rules, conditions, owned rulebooks, and encounter helpers). Use them only when the DM asks about live or account-specific data — a specific player's character sheet, a homebrew monster, or content from a rulebook they own. For general rules the DM would already know, answer directly and concisely.

You cannot modify anything on D&D Beyond and have no access to the local filesystem. Never claim to have changed D&D Beyond state. Keep answers tight and table-ready; the DM is mid-session.`;

// Events streamed back to the HTTP layer for one chat turn. The shape is the
// shared bridge/widget wire contract; re-exported so local imports keep working.
export type { BridgeEvent };

/**
 * Out-of-band control handle for an in-flight turn. runChatTurn populates
 * `interrupt` with the SDK query's own `interrupt()` as soon as the query
 * exists, so the HTTP layer can reclaim a *wedged* turn's subprocess directly:
 * a generator stuck inside `next()` can't be reached by `turn.return()` (that
 * queues behind the same stuck `next()`), but `interrupt()` is a control-channel
 * request that doesn't. Optional — the normal (non-wedge) path passes nothing.
 */
export interface TurnControl {
  interrupt?: () => Promise<void>;
}

function authAwareError(err: unknown, auth: ResolvedAuth): string {
  const msg = err instanceof Error ? err.message : String(err);
  const looksLikeAuth = /auth|api key|api_key|credential|401|unauthor|login/i.test(msg);
  if (looksLikeAuth && auth.mode === "subscription") {
    // Plain text, no markdown: the widget renders error events as raw text, so
    // backticks would reach the DM as literal characters.
    return (
      `${msg}\n\nThe bridge is in subscription mode. Ensure you are logged in with the ` +
      `claude CLI, or run "claude setup-token" and export CLAUDE_CODE_OAUTH_TOKEN. ` +
      `(To use a metered API key instead, set AI_BRIDGE_ALLOW_API_KEY=1 and ANTHROPIC_API_KEY.)`
    );
  }
  return msg;
}

// Built-in tools hard-denied via `disallowedTools`, independent of `tools: []`
// and `canUseTool` (layered — see the gate comment on runChatTurn). Names are
// the SDK's built-in tool ids; keep the filesystem/exec/network ones covered.
const DISALLOWED_BUILTIN_TOOLS = [
  "Bash",
  "BashOutput",
  "KillShell",
  "Read",
  "Write",
  "Edit",
  "Glob",
  "Grep",
  "NotebookEdit",
  "WebFetch",
  "WebSearch",
  "Task",
  "Agent",
  "Skill",
];

/**
 * Run a single chat turn against Claude with ddb-mcp attached, yielding typed
 * events.
 *
 * Security gate — three layers, because any one alone has a gap:
 * 1. `tools: []` removes every built-in tool from the base set, so there is no
 *    filesystem/exec/network tool to call at all.
 * 2. `disallowedTools` hard-denies the known built-ins by name — belt and
 *    braces should a future SDK default reintroduce a base tool.
 * 3. `canUseTool` allows a call only if the tool is in the read-only ddb
 *    allowlist and denies everything else. It cannot be the *sole* gate: the
 *    SDK consults it only for calls that need permission, so an auto-permitted
 *    read-only built-in (Read/Glob/Grep) could bypass it.
 * We intentionally do NOT list the ddb tools in `allowedTools`: a bare
 * `allowedTools` entry auto-approves a tool *before* `canUseTool` is consulted
 * (the SDK's CAN_USE_TOOL_SHADOWED warning), which would split enforcement.
 * Regression-pinned in agent.test.ts.
 */
export async function* runChatTurn(
  message: string,
  abortController?: AbortController,
  resumeSessionId?: string,
  model?: string,
  effort?: EffortLevel,
  control?: TurnControl,
): AsyncGenerator<BridgeEvent> {
  const auth = resolveAuth();

  // A per-request model overrides the AI_BRIDGE_MODEL env (config.model), which
  // stays the fallback for non-widget callers (curl, the smoke test). Undefined
  // → the Agent SDK / subscription default.
  const chosenModel = model ?? config.model;

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
        ...(chosenModel ? { model: chosenModel } : {}),
        // Reasoning effort (low/medium/high). Undefined → the SDK default.
        ...(effort ? { effort } : {}),
        systemPrompt: SYSTEM_PROMPT,
        // Hermetic: don't load this repo's CLAUDE.md, skills, or .mcp.json.
        settingSources: [],
        // Layers 1+2 of the tool gate (see the runChatTurn doc comment).
        tools: [],
        disallowedTools: DISALLOWED_BUILTIN_TOOLS,
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
        // Continue the prior conversation so follow-up questions keep context
        // (e.g. "how many spell slots?" after "what level is character X?").
        // The client echoes back the sessionId from the previous turn's `done`
        // event; the SDK replays that session's history from its local store.
        ...(resumeSessionId ? { resume: resumeSessionId } : {}),
        // Safety cap on tool-calling loops for a single turn.
        maxTurns: 12,
        env: auth.env,
        // Aborts the in-flight turn (and its ddb-mcp subprocess calls) when the
        // HTTP client disconnects, so a cancelled request stops spending the
        // subscription instead of running to completion for a discarded reply.
        ...(abortController ? { abortController } : {}),
      },
    });

    // Hand the HTTP layer a direct line to the query's control channel so a
    // wedged turn's subprocess can be interrupted out-of-band (see TurnControl).
    // SDK 0.3.21x widened interrupt()'s return to SDKControlInterruptResponse |
    // undefined; TurnControl only needs the completion signal, so discard it.
    if (control) control.interrupt = async () => { await response.interrupt(); };

    // Correlate a tool_use (assistant) with its later tool_result (user) so we
    // can label the result with the tool that produced it. The SDK delivers the
    // result in a separate `user` message keyed by tool_use_id.
    const toolNamesById = new Map<string, string>();

    for await (const m of response) {
      if (m.type === "assistant") {
        for (const block of m.message.content) {
          if (block.type === "text" && block.text) {
            yield { type: "text", text: block.text };
          } else if (block.type === "tool_use") {
            // Strip the mcp__<server>__ prefix to the bare ddb tool name.
            const bare = bareToolName(block.name);
            toolNamesById.set(block.id, bare);
            yield { type: "tool", name: block.name };
          }
        }
      } else if (m.type === "user" && typeof m.message.content !== "string") {
        // A user turn carrying tool_result blocks (the resolved tool calls).
        for (const block of m.message.content) {
          if (block.type === "tool_result") {
            const bare = toolNamesById.get(block.tool_use_id) ?? "unknown_tool";
            const text = extractToolResultText(block.content);
            // A tool call that errored (e.g. a private/not-found DDB character)
            // sets is_error on the result block. Surface it as a distinct error
            // event so the widget shows an inline error instead of a mis-parsed
            // stat card. (Cast: is_error may not be on the SDK's narrowed block.)
            if ((block as { is_error?: boolean }).is_error) {
              yield { type: "tool_error", tool: bare, message: text || "The lookup failed." };
              continue;
            }
            if (text) {
              // null = a suppressed-card tool (e.g. ddb_list_characters, whose
              // raw JSON the assistant re-states in prose); emit nothing.
              const card = parseToolResult(bare, text);
              if (card) yield card;
            }
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
    // An aborted turn must propagate as a THROW, not flatten into a yielded
    // error event: handleChat's catch owns the abort wording — the friendly
    // time-limit message when its turn timeout fired, silence on a client
    // disconnect (no one left to write to). Yielding here instead would hand
    // the DM the SDK's raw "operation was aborted" and leave that branch dead
    // code. Detected via the signal, not the error shape, because the SDK's
    // abort error type isn't part of its public contract.
    if (abortController?.signal.aborted) throw err;
    yield { type: "error", message: authAwareError(err, auth) };
  }
}
