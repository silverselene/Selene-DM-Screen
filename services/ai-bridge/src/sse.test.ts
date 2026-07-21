import { describe, expect, it } from "vitest";
import { EventEmitter } from "node:events";
import type { ServerResponse } from "node:http";
import { awaitWritable, formatSseFrame, writeSseFrame } from "./sse";

describe("formatSseFrame", () => {
  it("encodes event + single-line JSON data with a blank-line terminator", () => {
    expect(formatSseFrame("text", { type: "text", text: "hi" })).toBe(
      'event: text\ndata: {"type":"text","text":"hi"}\n\n',
    );
  });
});

// The full producer→consumer round-trip (bridge frame → widget parseSseRecord)
// lives in the dm-screen package (artifacts/dm-screen/src/lib/aiBridge.test.ts):
// the widget's parser needs Vite's import.meta.env typing, which this Node-only
// tsconfig doesn't provide. It imports THIS module's formatSseFrame so the two
// sides of the wire meet in one test.

/** Minimal ServerResponse stand-in: an EventEmitter with a controllable
 *  `write` backpressure signal and a `destroyed` flag. */
function fakeRes(writeReturns: boolean): ServerResponse & { emit(name: string): boolean } {
  const em = new EventEmitter() as unknown as ServerResponse & { destroyed: boolean };
  em.destroyed = false;
  (em as unknown as { write: () => boolean }).write = () => writeReturns;
  return em as ServerResponse & { emit(name: string): boolean };
}

describe("writeSseFrame", () => {
  it("returns res.write's backpressure signal", () => {
    expect(writeSseFrame(fakeRes(true), "text", { type: "text", text: "x" })).toBe(true);
    expect(writeSseFrame(fakeRes(false), "text", { type: "text", text: "x" })).toBe(false);
  });
});

describe("awaitWritable", () => {
  it("resolves immediately when the signal is already aborted", async () => {
    const ac = new AbortController();
    ac.abort();
    await expect(awaitWritable(fakeRes(false), ac.signal)).resolves.toBeUndefined();
  });

  it("resolves once the response drains", async () => {
    const res = fakeRes(false);
    const ac = new AbortController();
    let resolved = false;
    const p = awaitWritable(res, ac.signal).then(() => {
      resolved = true;
    });
    expect(resolved).toBe(false);
    res.emit("drain");
    await p;
    expect(resolved).toBe(true);
    // No leaked listeners on either side.
    expect((res as unknown as EventEmitter).listenerCount("drain")).toBe(0);
  });

  it("resolves when the turn aborts even if drain never fires", async () => {
    const res = fakeRes(false);
    const ac = new AbortController();
    const p = awaitWritable(res, ac.signal);
    ac.abort();
    await expect(p).resolves.toBeUndefined();
    expect((res as unknown as EventEmitter).listenerCount("drain")).toBe(0);
  });
});
