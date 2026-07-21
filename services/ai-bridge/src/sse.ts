import type { ServerResponse } from "node:http";

/**
 * SSE wire helpers for the chat stream, split out from server.ts so they stay
 * SDK-free and unit-testable (the round-trip against the widget's parseSseRecord
 * lives in sse.test.ts).
 *
 * The bridge always encodes the full event object — including its `type` — in
 * the single-line `data:` payload, so the redundant `event:` line is a
 * convenience for raw `curl` watching; the widget parses `data:` alone.
 */
export function formatSseFrame(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

/**
 * Write one SSE frame and return `res.write`'s backpressure signal (`false` =
 * the kernel/socket buffer is full). Callers streaming a turn should pair a
 * `false` with `awaitWritable` so a stalled-but-connected reader can't buffer
 * the whole turn in Node's heap.
 */
export function writeSseFrame(res: ServerResponse, event: string, data: unknown): boolean {
  return res.write(formatSseFrame(event, data));
}

/**
 * Resolve when it's safe to write more — the response has drained — OR the turn
 * has been aborted (timeout / client disconnect), whichever comes first. Racing
 * the abort keeps a wedged/stalled reader from parking this promise forever: the
 * turn's own timeout still fires and unblocks the loop. Bounds a stalled reader
 * to one buffered event instead of the entire turn. Already-aborted → immediate.
 */
export function awaitWritable(res: ServerResponse, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve();
  return new Promise<void>((resolve) => {
    const done = () => {
      res.off("drain", done);
      signal.removeEventListener("abort", done);
      resolve();
    };
    res.once("drain", done);
    signal.addEventListener("abort", done, { once: true });
  });
}
