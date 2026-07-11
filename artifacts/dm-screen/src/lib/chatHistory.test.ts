import { afterEach, describe, it, expect, vi } from "vitest";
import {
  CHAT_HISTORY_KEY,
  MAX_CHAT_MESSAGES,
  capChatMessages,
  validateCard,
  validateChatHistory,
  hasPersistedChat,
  type ChatMessage,
} from "./chatHistory";

function goodCard(over: Record<string, unknown> = {}) {
  return { type: "tool_result", tool: "ddb_get_monster", kind: "monster", title: "Goblin", markdown: "# Goblin", ...over };
}

describe("validateCard", () => {
  it("accepts a well-formed card and keeps string fields", () => {
    const c = validateCard(goodCard({ fields: { ac: "15", hp: "7", bogus: 3 } }));
    expect(c).toEqual({ type: "tool_result", tool: "ddb_get_monster", kind: "monster", title: "Goblin", markdown: "# Goblin", fields: { ac: "15", hp: "7" } });
  });
  it("coerces an unknown kind to generic", () => {
    expect(validateCard(goodCard({ kind: "spaceship" }))?.kind).toBe("generic");
  });
  it("rejects a card missing markdown/title/tool", () => {
    expect(validateCard(goodCard({ markdown: 3 }))).toBeUndefined();
    expect(validateCard({ type: "tool_result" })).toBeUndefined();
    expect(validateCard(null)).toBeUndefined();
  });
});

describe("validateChatHistory", () => {
  it("round-trips a valid mixed transcript, forcing pending false", () => {
    const input = [
      { role: "user", text: "hi" },
      { role: "assistant", text: "hello", tools: ["Monster"], cards: [goodCard()], toolErrors: [], pending: true, sourceQuery: "goblin", escalated: false },
    ];
    const out = validateChatHistory(input)!;
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({ role: "user", text: "hi" });
    const a = out[1] as Extract<ChatMessage, { role: "assistant" }>;
    expect(a.pending).toBe(false);
    expect(a.cards).toHaveLength(1);
    expect(a.sourceQuery).toBe("goblin");
  });

  it("caps to the most-recent MAX_CHAT_MESSAGES", () => {
    const many = Array.from({ length: MAX_CHAT_MESSAGES + 5 }, (_, i) => ({ role: "user", text: `m${i}` }));
    const out = validateChatHistory(many)!;
    expect(out).toHaveLength(MAX_CHAT_MESSAGES);
    expect((out[0] as { text: string }).text).toBe("m5"); // oldest 5 dropped
  });

  it("drops a malformed card but keeps the message", () => {
    const out = validateChatHistory([
      { role: "assistant", text: "x", tools: [], cards: [goodCard(), { type: "tool_result", markdown: 3 }], toolErrors: [], pending: false },
    ])!;
    expect((out[0] as { cards: unknown[] }).cards).toHaveLength(1);
  });

  it("drops an unknown-role entry", () => {
    const out = validateChatHistory([{ role: "system", text: "nope" }, { role: "user", text: "ok" }])!;
    expect(out).toHaveLength(1);
    expect((out[0] as { text: string }).text).toBe("ok");
  });

  it("drops a trailing content-less assistant message", () => {
    const out = validateChatHistory([
      { role: "user", text: "hi" },
      { role: "assistant", text: "", tools: [], cards: [], toolErrors: [], pending: true },
    ])!;
    expect(out).toHaveLength(1);
    expect(out[0].role).toBe("user");
  });

  it("returns undefined for a non-array", () => {
    expect(validateChatHistory({})).toBeUndefined();
    expect(validateChatHistory("[]")).toBeUndefined();
    expect(validateChatHistory(null)).toBeUndefined();
  });
});

describe("capChatMessages", () => {
  const mk = (n: number): ChatMessage[] =>
    Array.from({ length: n }, (_, i) => ({ role: "user", text: `m${i}` }));

  it("returns the array unchanged when at or under the cap", () => {
    const under = mk(MAX_CHAT_MESSAGES - 1);
    expect(capChatMessages(under)).toBe(under); // same reference, no copy
    const exact = mk(MAX_CHAT_MESSAGES);
    expect(capChatMessages(exact)).toBe(exact);
  });

  it("keeps the most-recent MAX_CHAT_MESSAGES on overflow", () => {
    const out = capChatMessages(mk(MAX_CHAT_MESSAGES + 3));
    expect(out).toHaveLength(MAX_CHAT_MESSAGES);
    expect((out[0] as { text: string }).text).toBe("m3"); // oldest 3 dropped
  });
});

describe("hasPersistedChat", () => {
  afterEach(() => vi.unstubAllGlobals());
  function stub(raw: string | null) {
    vi.stubGlobal("window", { localStorage: { getItem: (k: string) => (k === CHAT_HISTORY_KEY ? raw : null) } });
  }
  it("is false for missing/empty/[]", () => {
    stub(null); expect(hasPersistedChat()).toBe(false);
    stub(""); expect(hasPersistedChat()).toBe(false);
    stub("[]"); expect(hasPersistedChat()).toBe(false);
    stub("not json"); expect(hasPersistedChat()).toBe(false);
  });
  it("is false for a whitespace-only or empty array with incidental spacing", () => {
    stub("  [ ] "); expect(hasPersistedChat()).toBe(false);
    stub("[\n]"); expect(hasPersistedChat()).toBe(false);
  });
  it("is true for a non-empty array (with or without leading whitespace)", () => {
    stub(JSON.stringify([{ role: "user", text: "hi" }]));
    expect(hasPersistedChat()).toBe(true);
    stub("  [ { \"role\": \"user\" } ]");
    expect(hasPersistedChat()).toBe(true);
  });
});
