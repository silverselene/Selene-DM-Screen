import { describe, expect, it } from "vitest";
import type { BridgeEvent } from "@workspace/bridge-protocol";
import { formatSmokeEvent } from "./smokeFormat";

describe("formatSmokeEvent", () => {
  it("streams text to stdout with no failure flag", () => {
    expect(formatSmokeEvent({ type: "text", text: "hello" })).toEqual([
      { stream: "out", text: "hello" },
    ]);
  });

  it("prints a tool call to stderr", () => {
    const [line] = formatSmokeEvent({ type: "tool", name: "mcp__dndbeyond__ddb_get_spell" });
    expect(line.stream).toBe("err");
    expect(line.text).toContain("mcp__dndbeyond__ddb_get_spell");
    expect(line.failure).toBeFalsy();
  });

  // The bug this closes: a tool_result had no case, so a smoke run showed a tool
  // being called and then nothing.
  it("prints a tool_result's tool and title to stderr", () => {
    const [line] = formatSmokeEvent({
      type: "tool_result",
      tool: "ddb_get_monster",
      kind: "monster",
      title: "Goblin",
      markdown: "# Goblin",
    });
    expect(line.stream).toBe("err");
    expect(line.text).toContain("ddb_get_monster");
    expect(line.text).toContain("Goblin");
    expect(line.failure).toBeFalsy();
  });

  // The headline gap: a tool_error (e.g. an expired ddb session — the exact
  // condition the README says to smoke-test for) was invisible AND left the
  // exit code 0. It must print and mark the run a failure.
  it("prints a tool_error and marks the run a failure", () => {
    const [line] = formatSmokeEvent({
      type: "tool_error",
      tool: "ddb_get_character",
      message: "Session expired",
    });
    expect(line.stream).toBe("err");
    expect(line.text).toContain("ddb_get_character");
    expect(line.text).toContain("Session expired");
    expect(line.failure).toBe(true);
  });

  it("prints done with subtype/cost/session and no failure flag", () => {
    const [line] = formatSmokeEvent({
      type: "done",
      subtype: "success",
      result: "answer",
      costUsd: 0.03,
      sessionId: "sess_1",
    });
    expect(line.stream).toBe("err");
    expect(line.text).toContain("success");
    expect(line.text).toContain("0.03");
    expect(line.text).toContain("sess_1");
    expect(line.failure).toBeFalsy();
  });

  it("marks an error event as a failure", () => {
    const [line] = formatSmokeEvent({ type: "error", message: "boom" });
    expect(line.stream).toBe("err");
    expect(line.text).toContain("boom");
    expect(line.failure).toBe(true);
  });

  // Exhaustiveness sanity: every BridgeEvent variant produces at least one line.
  it("returns a line for every event variant", () => {
    const variants: BridgeEvent[] = [
      { type: "text", text: "" },
      { type: "tool", name: "x" },
      { type: "tool_result", tool: "x", kind: "generic", title: "t", markdown: "m" },
      { type: "tool_error", tool: "x", message: "e" },
      { type: "done", subtype: "success", result: "r" },
      { type: "error", message: "e" },
    ];
    for (const ev of variants) {
      expect(formatSmokeEvent(ev).length).toBeGreaterThan(0);
    }
  });
});
