import { afterEach, describe, expect, it, vi } from "vitest";

// The real query() spawns the Claude Code subprocess; capture its options
// instead so we can assert on the exact tool-gate configuration handed to the
// SDK. The generator yields nothing (runChatTurn just drains it) unless a test
// sets `queryError`, in which case it throws — the failing-SDK-turn shape.
const mocks = vi.hoisted(() => ({
  capturedOptions: undefined as Record<string, unknown> | undefined,
  queryError: undefined as Error | undefined,
}));

vi.mock("@anthropic-ai/claude-agent-sdk", () => ({
  query: (args: { options: Record<string, unknown> }) => {
    mocks.capturedOptions = args.options;
    return (async function* () {
      if (mocks.queryError) throw mocks.queryError;
    })();
  },
}));

import { runChatTurn } from "./agent";
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
