import type { BridgeEvent } from "@workspace/bridge-protocol";

/** One line of smoke-test output. `text` events go to stdout (the streamed
 *  answer body); every diagnostic goes to stderr. `failure` marks a run the
 *  smoke test should exit non-zero on. */
export interface SmokeLine {
  stream: "out" | "err";
  text: string;
  failure?: boolean;
}

/**
 * Map one streamed BridgeEvent to smoke-test output lines. Pure and exported so
 * the switch is unit-tested without spinning up the Agent SDK (smoke.ts runs a
 * real turn at import). Covers `tool_result`/`tool_error` — previously dropped,
 * which made a broken ddb session (an expired `session.json`, the exact thing
 * the README says to smoke-test for) invisible and left the exit code 0.
 */
export function formatSmokeEvent(ev: BridgeEvent): SmokeLine[] {
  switch (ev.type) {
    case "text":
      return [{ stream: "out", text: ev.text }];
    case "tool":
      return [{ stream: "err", text: `\n[smoke] tool → ${ev.name}` }];
    case "tool_result":
      return [{ stream: "err", text: `\n[smoke] tool_result ← ${ev.tool}: ${ev.title}` }];
    case "tool_error":
      return [
        { stream: "err", text: `\n[smoke] tool_error ← ${ev.tool}: ${ev.message}`, failure: true },
      ];
    case "done":
      return [
        {
          stream: "err",
          text:
            `\n\n[smoke] done (${ev.subtype})` +
            (ev.costUsd != null ? ` cost=$${ev.costUsd}` : "") +
            (ev.sessionId ? ` session=${ev.sessionId}` : ""),
        },
      ];
    case "error":
      return [{ stream: "err", text: `\n[smoke] ERROR: ${ev.message}`, failure: true }];
  }
}
