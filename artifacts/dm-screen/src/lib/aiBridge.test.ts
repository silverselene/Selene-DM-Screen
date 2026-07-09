import { describe, it, expect } from "vitest";
import { isBridgeEvent, parseSseRecord, friendlyToolName } from "./aiBridge";

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
