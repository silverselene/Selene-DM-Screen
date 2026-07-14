import { describe, it, expect, vi } from "vitest";
import {
  BRIDGE_URL,
  isBridgeEvent,
  isBridgeHealth,
  parseSseRecord,
  friendlyToolName,
  buildChatBody,
  streamChat,
  stallTimeoutForTurn,
  STREAM_STALL_TIMEOUT_MS,
  STREAM_STALL_MARGIN_MS,
} from "./aiBridge";

describe("BRIDGE_URL", () => {
  it("falls back to the default bridge address when no define is injected", () => {
    // Vitest runs without vite.config.ts's `define` block, exercising exactly
    // the fallback path; the app bundle gets the AI_BRIDGE_PORT-derived URL.
    expect(BRIDGE_URL).toBe("http://127.0.0.1:38900");
  });
});

describe("buildChatBody", () => {
  it("includes only message when nothing else is given", () => {
    expect(buildChatBody("hi")).toEqual({ message: "hi" });
  });

  it("includes resume, model, and effort when provided", () => {
    expect(buildChatBody("hi", "s1", "claude-opus-4-8", "high")).toEqual({
      message: "hi",
      resume: "s1",
      model: "claude-opus-4-8",
      effort: "high",
    });
  });

  it("omits an undefined or empty resume/model", () => {
    expect(buildChatBody("hi", undefined, undefined, "medium")).toEqual({ message: "hi", effort: "medium" });
    expect(buildChatBody("hi", "", "")).toEqual({ message: "hi" });
  });
});

describe("isBridgeEvent", () => {
  it("accepts each well-formed variant", () => {
    expect(isBridgeEvent({ type: "text", text: "hi" })).toBe(true);
    expect(isBridgeEvent({ type: "tool", name: "mcp__dndbeyond__ddb_get_spell" })).toBe(true);
    expect(isBridgeEvent({ type: "done", result: "ok", subtype: "success" })).toBe(true);
    expect(isBridgeEvent({ type: "error", message: "boom" })).toBe(true);
  });

  it("keeps optional done fields flexible", () => {
    expect(
      isBridgeEvent({ type: "done", result: "", subtype: "error_max_turns", usage: {}, costUsd: 0, sessionId: "s1" }),
    ).toBe(true);
  });

  it("rejects a valid discriminant whose required field is missing or wrong-typed", () => {
    expect(isBridgeEvent({ type: "text" })).toBe(false);
    expect(isBridgeEvent({ type: "text", text: 42 })).toBe(false);
    expect(isBridgeEvent({ type: "tool", name: null })).toBe(false);
    expect(isBridgeEvent({ type: "done", result: "ok" })).toBe(false); // no subtype
    expect(isBridgeEvent({ type: "done", subtype: "success" })).toBe(false); // no result
    expect(isBridgeEvent({ type: "error" })).toBe(false);
  });

  it("fails safe on an unknown/drifted event type", () => {
    // A future event this older client doesn't know about must be dropped, not
    // cast through — this is the drift guard.
    expect(isBridgeEvent({ type: "thinking", text: "…" })).toBe(false);
    expect(isBridgeEvent({ type: "" })).toBe(false);
  });

  it("rejects non-objects and objects without a string type", () => {
    expect(isBridgeEvent(null)).toBe(false);
    expect(isBridgeEvent(undefined)).toBe(false);
    expect(isBridgeEvent("text")).toBe(false);
    expect(isBridgeEvent(42)).toBe(false);
    expect(isBridgeEvent([])).toBe(false);
    expect(isBridgeEvent({ text: "hi" })).toBe(false);
    expect(isBridgeEvent({ type: 1, text: "hi" })).toBe(false);
  });
});

describe("isBridgeEvent — tool_result", () => {
  it("accepts a well-formed tool_result", () => {
    expect(
      isBridgeEvent({
        type: "tool_result",
        tool: "ddb_get_monster",
        kind: "monster",
        title: "Goblin",
        fields: { ac: "15", hp: "7" },
        markdown: "# Goblin",
      }),
    ).toBe(true);
  });

  it("accepts a tool_result with no fields (fields is optional)", () => {
    expect(
      isBridgeEvent({ type: "tool_result", tool: "ddb_get_spell", kind: "generic", title: "Fireball", markdown: "# Fireball" }),
    ).toBe(true);
  });

  it("accepts an unknown kind (widget treats it as generic)", () => {
    expect(
      isBridgeEvent({ type: "tool_result", tool: "ddb_x", kind: "future-kind", title: "X", markdown: "x" }),
    ).toBe(true);
  });

  it("rejects a tool_result missing markdown", () => {
    expect(isBridgeEvent({ type: "tool_result", tool: "ddb_x", kind: "generic", title: "X" })).toBe(false);
  });

  it("rejects a tool_result with non-string title", () => {
    expect(isBridgeEvent({ type: "tool_result", tool: "ddb_x", kind: "generic", title: 3, markdown: "x" })).toBe(false);
  });
});

describe("isBridgeEvent — tool_error", () => {
  it("accepts a well-formed tool_error", () => {
    expect(isBridgeEvent({ type: "tool_error", tool: "ddb_get_character", message: "Character is private." })).toBe(true);
  });

  it("rejects a tool_error missing message or with a non-string field", () => {
    expect(isBridgeEvent({ type: "tool_error", tool: "ddb_get_character" })).toBe(false);
    expect(isBridgeEvent({ type: "tool_error", tool: 3, message: "x" })).toBe(false);
  });
});

describe("isBridgeHealth", () => {
  const ok = {
    ok: true,
    service: "selene-ai-bridge",
    billing: "subscription",
    ddbMcpFound: true,
    allowedTools: 26,
  };
  it("accepts a well-formed health body", () => {
    expect(isBridgeHealth(ok)).toBe(true);
  });
  // Pre-privacy-fix bridges also sent ddbMcpEntry (an absolute path); an old
  // bridge paired with a new SPA must still validate.
  it("accepts a legacy body still carrying ddbMcpEntry", () => {
    expect(isBridgeHealth({ ...ok, ddbMcpEntry: null, ddbMcpFound: false })).toBe(true);
  });
  // Version-skew tolerance: only the fields the widget actually consumes
  // (billing, ddbMcpFound) are required. A future bridge renaming or dropping a
  // cosmetic field must NOT brick AI Chat on an older deployed SPA.
  it("accepts a minimal body carrying only the consumed fields", () => {
    expect(isBridgeHealth({ billing: "subscription", ddbMcpFound: true })).toBe(true);
  });
  it("accepts unknown extra fields from a newer bridge", () => {
    expect(isBridgeHealth({ ...ok, protocolVersion: 1, futureField: { deep: true } })).toBe(true);
  });
  it("rejects a body missing billing (would render `undefined`)", () => {
    const { billing: _drop, ...noBilling } = ok;
    expect(isBridgeHealth(noBilling)).toBe(false);
  });
  it("rejects a missing or wrong-typed ddbMcpFound", () => {
    const { ddbMcpFound: _drop, ...noFound } = ok;
    expect(isBridgeHealth(noFound)).toBe(false);
    expect(isBridgeHealth({ ...ok, ddbMcpFound: "yes" })).toBe(false);
  });
  it("rejects a non-object", () => {
    expect(isBridgeHealth(null)).toBe(false);
    expect(isBridgeHealth("{}")).toBe(false);
  });
});

describe("parseSseRecord", () => {
  it("decodes the data: line and ignores the redundant event: line", () => {
    const record = 'event: text\ndata: {"type":"text","text":"Hello"}';
    expect(parseSseRecord(record)).toEqual({ type: "text", text: "Hello" });
  });

  it("strips exactly one leading space after the colon", () => {
    // "data: X" → "X" (one space stripped); a second space is part of the value.
    const record = 'data:  {"type":"text","text":"x"}'; // two spaces → payload starts with a space
    // JSON.parse tolerates leading whitespace, so this still decodes.
    expect(parseSseRecord(record)).toEqual({ type: "text", text: "x" });
  });

  it("joins multi-line data: fields with newlines before parsing", () => {
    const record = 'data: {"type":"text",\ndata: "text":"multi"}';
    expect(parseSseRecord(record)).toEqual({ type: "text", text: "multi" });
  });

  it("returns null for comments / keep-alives (no data: line)", () => {
    expect(parseSseRecord(": keep-alive")).toBeNull();
    expect(parseSseRecord("event: ping")).toBeNull();
    expect(parseSseRecord("")).toBeNull();
  });

  it("returns null for malformed JSON", () => {
    expect(parseSseRecord("data: {not json")).toBeNull();
  });

  it("returns null when the JSON is valid but not a BridgeEvent", () => {
    expect(parseSseRecord('data: {"type":"text","text":123}')).toBeNull();
    expect(parseSseRecord('data: {"hello":"world"}')).toBeNull();
    expect(parseSseRecord("data: 42")).toBeNull();
  });

  it("parses a tool_result data record", () => {
    const ev = { type: "tool_result", tool: "ddb_get_monster", kind: "monster", title: "Goblin", fields: { ac: "15" }, markdown: "# Goblin" };
    const record = `event: tool_result\ndata: ${JSON.stringify(ev)}`;
    expect(parseSseRecord(record)).toEqual(ev);
  });

  it("parses a tool_error data record", () => {
    const ev = { type: "tool_error", tool: "ddb_get_character", message: "Character 1 is private and cannot be accessed." };
    const record = `event: tool_error\ndata: ${JSON.stringify(ev)}`;
    expect(parseSseRecord(record)).toEqual(ev);
  });
});

describe("friendlyToolName", () => {
  it("strips the mcp server prefix and ddb_ and title-cases", () => {
    expect(friendlyToolName("mcp__dndbeyond__ddb_get_character")).toBe("Get character");
    expect(friendlyToolName("mcp__dndbeyond__ddb_search_monsters")).toBe("Search monsters");
  });

  it("degrades gracefully on names without the expected prefixes", () => {
    expect(friendlyToolName("ddb_rate_encounter")).toBe("Rate encounter");
    expect(friendlyToolName("plain_tool")).toBe("Plain tool");
  });
});

describe("stallTimeoutForTurn", () => {
  it("falls back to the built-in floor when the bridge reports no turn cap", () => {
    expect(stallTimeoutForTurn(undefined)).toBe(STREAM_STALL_TIMEOUT_MS);
  });
  it("stays above a small reported cap (floor still wins)", () => {
    // Default bridge cap (180s) + margin (20s) == the 200s floor, so the floor
    // applies; nothing below it can shrink the watchdog.
    expect(stallTimeoutForTurn(180_000)).toBe(STREAM_STALL_TIMEOUT_MS);
    expect(stallTimeoutForTurn(1_000)).toBe(STREAM_STALL_TIMEOUT_MS);
  });
  it("sizes above a raised cap so the client never abandons an in-progress turn", () => {
    // The bug this guards: an operator raising AI_BRIDGE_TURN_TIMEOUT_MS past the
    // floor must push the watchdog up with it, keeping stall > server turn cap.
    expect(stallTimeoutForTurn(300_000)).toBe(300_000 + STREAM_STALL_MARGIN_MS);
    expect(stallTimeoutForTurn(300_000)).toBeGreaterThan(300_000);
  });
  it("ignores a garbage/untrusted cap and keeps the floor", () => {
    expect(stallTimeoutForTurn(NaN)).toBe(STREAM_STALL_TIMEOUT_MS);
    expect(stallTimeoutForTurn(-5)).toBe(STREAM_STALL_TIMEOUT_MS);
    expect(stallTimeoutForTurn(Infinity)).toBe(STREAM_STALL_TIMEOUT_MS);
  });
});

describe("streamChat stall watchdog", () => {
  it("abandons a stream that stops sending bytes and reports it as an error", async () => {
    // A stream that sends one event then goes permanently silent — the wedged
    // bridge / half-dead socket the watchdog exists for. Node's fetch is
    // stubbed; everything downstream of it is the real streamChat code.
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode('event: text\ndata: {"type":"text","text":"hi"}\n\n'),
        );
        // ...and then silence, forever.
      },
      cancel() {
        cancelled = true;
      },
    });
    const fetchStub = vi.fn().mockResolvedValue(new Response(body, { status: 200 }));
    vi.stubGlobal("fetch", fetchStub);
    try {
      const events: unknown[] = [];
      await expect(
        streamChat("hi", (e) => events.push(e), undefined, undefined, undefined, undefined, 50),
      ).rejects.toThrow(/stopped responding/);
      // The event before the stall was still delivered, and the cancel tore the
      // stream down (which is what lets the bridge abort the in-flight turn).
      expect(events).toEqual([{ type: "text", text: "hi" }]);
      expect(cancelled).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("does not fire on a healthy stream that finishes promptly", async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode('event: done\ndata: {"type":"done","result":"ok","subtype":"success"}\n\n'),
        );
        controller.close();
      },
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(body, { status: 200 })));
    try {
      const events: unknown[] = [];
      await streamChat("hi", (e) => events.push(e), undefined, undefined, undefined, undefined, 5000);
      expect(events).toEqual([{ type: "done", result: "ok", subtype: "success" }]);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
