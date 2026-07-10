/**
 * The wire contract between the optional local AI bridge (services/ai-bridge,
 * HTTP + SSE producer) and the dm-screen AI Chat widget (browser consumer).
 *
 * This package is **types only** — it emits no runtime code and has no
 * dependencies, so both the Node service and the browser bundle can import it
 * with `import type` (the import is erased at build time). The browser cannot
 * import the bridge package directly (it pulls in the Agent SDK + a native
 * binary), which is why this shared declaration exists: it makes a drift
 * between producer and consumer a **compile error** on whichever side lags,
 * instead of a silent runtime mis-parse.
 *
 * Note this guarantees only that the two sides agree on the *type*. The bytes
 * arriving on the socket are still untrusted at runtime — the consumer
 * validates each record shape before use (see `parseSseRecord` in
 * artifacts/dm-screen/src/lib/aiBridge.ts).
 */

/** One event streamed back from `POST /chat` for a single chat turn. */
export type BridgeEvent =
  | { type: "text"; text: string }
  | { type: "tool"; name: string }
  | {
      /**
       * A resolved tool call's result, structured for a preview card. `markdown`
       * always carries the full raw tool-result text (the graceful-degradation
       * fallback); `fields` is best-effort and may be absent or partial. `kind`
       * selects the card style — an unknown value is treated as "generic".
       */
      type: "tool_result";
      tool: string;
      kind: "monster" | "character" | "generic";
      title: string;
      fields?: Record<string, string>;
      markdown: string;
    }
  | {
      /**
       * A tool call that errored (e.g. a private or not-found D&D Beyond
       * character). Emitted instead of `tool_result` when the SDK marks the
       * result block `is_error`, so the widget renders an inline error rather
       * than a mis-parsed card. `message` is the raw error text from the tool.
       */
      type: "tool_error";
      tool: string;
      message: string;
    }
  | {
      type: "done";
      result: string;
      subtype: string;
      usage?: unknown;
      costUsd?: number;
      sessionId?: string;
    }
  | { type: "error"; message: string };

/** Response body of the bridge's `GET /health` probe. */
export interface BridgeHealth {
  ok: boolean;
  service: string;
  billing: string;
  ddbMcpEntry: string | null;
  ddbMcpFound: boolean;
  allowedTools: number;
}
