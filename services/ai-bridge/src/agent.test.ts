import { afterEach, describe, expect, it, vi } from "vitest";

// The real query() spawns the Claude Code subprocess; capture its options
// instead so we can assert on the exact tool-gate configuration handed to the
// SDK. The generator yields nothing (runChatTurn just drains it) unless a test
// sets `queryError`, in which case it throws — the failing-SDK-turn shape.
const mocks = vi.hoisted(() => ({
  capturedOptions: undefined as Record<string, unknown> | undefined,
  queryError: undefined as Error | undefined,
  // SDK messages the mocked query() yields for the mapping-loop tests.
  queryMessages: [] as unknown[],
  // Stand-in for the real Query's interrupt() control method.
  interrupt: undefined as (() => Promise<void>) | undefined,
}));

vi.mock("@anthropic-ai/claude-agent-sdk", () => ({
  query: (args: { options: Record<string, unknown> }) => {
    mocks.capturedOptions = args.options;
    const gen = (async function* () {
      if (mocks.queryError) throw mocks.queryError;
      for (const m of mocks.queryMessages) yield m;
    })();
    // The real query() return value is an AsyncGenerator that ALSO exposes
    // control methods (interrupt/setPermissionMode). runChatTurn plumbs
    // interrupt() out via the control handle; attach a stand-in here.
    (gen as unknown as { interrupt: () => Promise<void> }).interrupt =
      mocks.interrupt ?? (async () => {});
    return gen;
  },
}));

import { runChatTurn, type TurnControl } from "./agent";
import { ALLOWED_TOOL_IDS, ALLOWED_TOOL_SET } from "./ddbTools";

async function drainTurn(): Promise<Record<string, unknown>> {
  mocks.capturedOptions = undefined;
  for await (const _ev of runChatTurn("hello")) {
    /* drain */
  }
  if (!mocks.capturedOptions) throw new Error("query() was never invoked");
  return mocks.capturedOptions;
}

type CanUseTool = (
  toolName: string,
  input: Record<string, unknown>,
) => Promise<{ behavior: string }>;

// The bridge's "no filesystem/exec access" guarantee must NOT rest on
// canUseTool alone: the SDK only consults canUseTool for calls that need
// permission, and auto-permitted read-only built-ins (Read/Glob/Grep) could
// bypass it — prompt injection inside untrusted D&D Beyond content could then
// read local files into the chat. These tests pin the layered gate.
describe("runChatTurn tool gate", () => {
  it("disables the SDK's built-in tool set entirely (tools: [])", async () => {
    const opts = await drainTurn();
    expect(opts.tools).toEqual([]);
  });

  it("hard-denies filesystem/exec/network built-ins via disallowedTools", async () => {
    const opts = await drainTurn();
    const disallowed = opts.disallowedTools;
    expect(Array.isArray(disallowed)).toBe(true);
    for (const name of [
      "Bash",
      "Read",
      "Write",
      "Edit",
      "Glob",
      "Grep",
      "NotebookEdit",
      "WebFetch",
      "WebSearch",
      "Task",
    ]) {
      expect(disallowed).toContain(name);
    }
    // The read-only ddb allowlist must never be swept into the deny layer.
    for (const id of ALLOWED_TOOL_IDS) {
      expect(disallowed).not.toContain(id);
    }
  });

  it("canUseTool still allows only the ddb read allowlist", async () => {
    const opts = await drainTurn();
    const canUseTool = opts.canUseTool as CanUseTool;
    const someAllowed = [...ALLOWED_TOOL_SET][0];
    expect((await canUseTool(someAllowed, {})).behavior).toBe("allow");
    expect((await canUseTool("Read", {})).behavior).toBe("deny");
    expect((await canUseTool("mcp__dndbeyond__ddb_interact", {})).behavior).toBe("deny");
  });
});

// The abort contract with server.ts: an aborted turn (timeout or client
// disconnect) THROWS out of runChatTurn — handleChat's catch owns the wording
// (friendly "time limit" message when its timeout fired). Flattening the abort
// into a yielded error event would make that branch dead code and surface the
// SDK's raw "operation was aborted" to the DM instead.
describe("runChatTurn abort/error contract", () => {
  afterEach(() => {
    mocks.queryError = undefined;
  });

  it("rethrows an SDK failure when the turn's signal has been aborted", async () => {
    mocks.queryError = new Error("The operation was aborted");
    const abort = new AbortController();
    abort.abort();
    await expect(async () => {
      for await (const _ev of runChatTurn("hello", abort)) {
        /* drain */
      }
    }).rejects.toThrow("The operation was aborted");
  });

  it("yields an error event for a non-abort SDK failure", async () => {
    mocks.queryError = new Error("boom");
    const events: Array<{ type: string; message?: string }> = [];
    for await (const ev of runChatTurn("hello", new AbortController())) {
      events.push(ev as { type: string; message?: string });
    }
    expect(events).toEqual([{ type: "error", message: expect.stringContaining("boom") }]);
  });
});

// The wedge-recovery path in server.ts needs an out-of-band way to interrupt a
// turn whose generator is stuck (turn.return() would queue behind the wedged
// next()). runChatTurn plumbs the SDK query's interrupt() onto a caller-supplied
// control handle so the HTTP layer can reclaim the subprocess directly.
describe("runChatTurn interrupt handle", () => {
  afterEach(() => {
    mocks.interrupt = undefined;
  });

  it("exposes the SDK query's interrupt() on the control handle once the query exists", async () => {
    const interrupt = vi.fn().mockResolvedValue(undefined);
    mocks.interrupt = interrupt;
    const control: TurnControl = {};
    for await (const _ev of runChatTurn("hello", undefined, undefined, undefined, undefined, control)) {
      /* drain */
    }
    expect(typeof control.interrupt).toBe("function");
    await control.interrupt!();
    expect(interrupt).toHaveBeenCalledTimes(1);
  });

  it("leaves the handle unset when no control object is passed (no crash)", async () => {
    // The common path (no wedge tracking) must not require a control object.
    await expect(async () => {
      for await (const _ev of runChatTurn("hello")) {
        /* drain */
      }
    }).not.toThrow();
  });
});

// The SDK-message → BridgeEvent mapping loop (assistant text/tool_use,
// user tool_result correlation + is_error, string-content skip, result → done)
// had no coverage: agent.test.ts's mock yielded nothing, so a drift in message
// shape or a correlation regression passed CI silently.
describe("runChatTurn SDK-message mapping", () => {
  afterEach(() => {
    mocks.queryMessages = [];
  });

  async function collect(): Promise<Array<Record<string, unknown>>> {
    const out: Array<Record<string, unknown>> = [];
    for await (const ev of runChatTurn("hello")) {
      out.push(ev as Record<string, unknown>);
    }
    return out;
  }

  it("maps assistant text blocks to text events (skipping empty text)", async () => {
    mocks.queryMessages = [
      { type: "assistant", message: { content: [
        { type: "text", text: "Hello there" },
        { type: "text", text: "" }, // empty → skipped
      ] } },
    ];
    expect(await collect()).toEqual([{ type: "text", text: "Hello there" }]);
  });

  it("maps a tool_use to a tool event and correlates its later tool_result", async () => {
    mocks.queryMessages = [
      { type: "assistant", message: { content: [
        { type: "tool_use", id: "tu_1", name: "mcp__dndbeyond__ddb_get_spell" },
      ] } },
      { type: "user", message: { content: [
        { type: "tool_result", tool_use_id: "tu_1", content: "**Fireball** — Level 3 Evocation" },
      ] } },
    ];
    const events = await collect();
    expect(events[0]).toEqual({ type: "tool", name: "mcp__dndbeyond__ddb_get_spell" });
    expect(events[1]).toMatchObject({ type: "tool_result", tool: "ddb_get_spell", kind: "spell", title: "Fireball" });
  });

  it("labels a tool_result whose tool_use was never seen as unknown_tool", async () => {
    mocks.queryMessages = [
      { type: "user", message: { content: [
        { type: "tool_result", tool_use_id: "orphan", content: "# Some Heading\nbody" },
      ] } },
    ];
    const events = await collect();
    expect(events[0]).toMatchObject({ type: "tool_result", tool: "unknown_tool" });
  });

  it("maps an is_error tool_result to a tool_error event with the correlated tool name", async () => {
    mocks.queryMessages = [
      { type: "assistant", message: { content: [
        { type: "tool_use", id: "tu_2", name: "mcp__dndbeyond__ddb_get_character" },
      ] } },
      { type: "user", message: { content: [
        { type: "tool_result", tool_use_id: "tu_2", content: "Character is private", is_error: true },
      ] } },
    ];
    const events = await collect();
    expect(events[1]).toEqual({ type: "tool_error", tool: "ddb_get_character", message: "Character is private" });
  });

  it("falls back to a generic error message when an is_error result has no text", async () => {
    mocks.queryMessages = [
      { type: "assistant", message: { content: [
        { type: "tool_use", id: "tu_3", name: "mcp__dndbeyond__ddb_get_monster" },
      ] } },
      { type: "user", message: { content: [
        { type: "tool_result", tool_use_id: "tu_3", content: "", is_error: true },
      ] } },
    ];
    const events = await collect();
    expect(events[1]).toEqual({ type: "tool_error", tool: "ddb_get_monster", message: "The lookup failed." });
  });

  it("skips a user message whose content is a plain string (not tool_result blocks)", async () => {
    mocks.queryMessages = [
      { type: "user", message: { content: "just a string, no blocks" } },
      { type: "assistant", message: { content: [{ type: "text", text: "answer" }] } },
    ];
    expect(await collect()).toEqual([{ type: "text", text: "answer" }]);
  });

  it("suppresses the card for a raw-dump tool (ddb_list_characters) but still emits the tool event", async () => {
    mocks.queryMessages = [
      { type: "assistant", message: { content: [
        { type: "tool_use", id: "tu_4", name: "mcp__dndbeyond__ddb_list_characters" },
      ] } },
      { type: "user", message: { content: [
        { type: "tool_result", tool_use_id: "tu_4", content: '[{"id":1}]' },
      ] } },
    ];
    // The tool chip shows; the JSON-dump card is suppressed (no tool_result event).
    expect(await collect()).toEqual([{ type: "tool", name: "mcp__dndbeyond__ddb_list_characters" }]);
  });

  it("maps a success result to a done event carrying usage/cost/session", async () => {
    mocks.queryMessages = [
      { type: "result", subtype: "success", result: "final answer", usage: { input_tokens: 5 }, total_cost_usd: 0.01, session_id: "sess_1" },
    ];
    expect(await collect()).toEqual([
      { type: "done", subtype: "success", result: "final answer", usage: { input_tokens: 5 }, costUsd: 0.01, sessionId: "sess_1" },
    ]);
  });

  it("renders a non-success result subtype as a parenthesized marker in `result`", async () => {
    mocks.queryMessages = [
      { type: "result", subtype: "error_max_turns", usage: undefined, total_cost_usd: undefined, session_id: "sess_2" },
    ];
    const events = await collect();
    expect(events[0]).toMatchObject({ type: "done", subtype: "error_max_turns", result: "(error_max_turns)" });
  });
});
