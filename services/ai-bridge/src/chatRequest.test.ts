import { describe, it, expect } from "vitest";
import { parseChatRequest } from "./chatRequest";

describe("parseChatRequest", () => {
  it("parses a minimal valid body", () => {
    const r = parseChatRequest(JSON.stringify({ message: "hi" }));
    expect(r).toEqual({ ok: true, value: { message: "hi" } });
  });

  it("passes through resume, model, and a valid effort", () => {
    const r = parseChatRequest(
      JSON.stringify({ message: "hi", resume: "s1", model: "claude-opus-4-8", effort: "high" }),
    );
    expect(r).toEqual({
      ok: true,
      value: { message: "hi", resume: "s1", model: "claude-opus-4-8", effort: "high" },
    });
  });

  it("drops an out-of-enum effort (e.g. xhigh/max/garbage) instead of forwarding it", () => {
    for (const bad of ["xhigh", "max", "HIGH", "", "medium ", 3, null]) {
      const r = parseChatRequest(JSON.stringify({ message: "hi", effort: bad }));
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value.effort).toBeUndefined();
    }
  });

  it("accepts each valid effort level", () => {
    for (const good of ["low", "medium", "high"] as const) {
      const r = parseChatRequest(JSON.stringify({ message: "hi", effort: good }));
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value.effort).toBe(good);
    }
  });

  it("drops a non-string or empty model", () => {
    expect(parseChatRequest(JSON.stringify({ message: "hi", model: "" })).ok).toBe(true);
    const r1 = parseChatRequest(JSON.stringify({ message: "hi", model: "" }));
    if (r1.ok) expect(r1.value.model).toBeUndefined();
    const r2 = parseChatRequest(JSON.stringify({ message: "hi", model: 42 }));
    if (r2.ok) expect(r2.value.model).toBeUndefined();
  });

  it("drops an empty or non-string resume", () => {
    const r = parseChatRequest(JSON.stringify({ message: "hi", resume: "" }));
    if (r.ok) expect(r.value.resume).toBeUndefined();
  });

  it("rejects a missing, empty, or non-string message", () => {
    expect(parseChatRequest(JSON.stringify({}))).toEqual({
      ok: false,
      error: 'Body must be JSON: { "message": "<non-empty string>" }',
    });
    expect(parseChatRequest(JSON.stringify({ message: "   " })).ok).toBe(false);
    expect(parseChatRequest(JSON.stringify({ message: 3 })).ok).toBe(false);
  });

  it("rejects invalid JSON with an error result", () => {
    const r = parseChatRequest("{not json");
    expect(r.ok).toBe(false);
  });
});
