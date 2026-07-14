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

/**
 * Reasoning-effort levels the AI Chat widget exposes. A subset of the Agent
 * SDK's `EffortLevel` (`low|medium|high|xhigh|max`) — we surface only the three
 * that are valid on every model, so no per-model gating is needed. Guides
 * adaptive-thinking depth: `low` is fastest, `high` is the SDK default.
 */
export type EffortLevel = "low" | "medium" | "high";

/**
 * Request body of the bridge's `POST /chat`. Shared so the widget (producer) and
 * bridge (consumer) can't drift on the field set. The bytes on the socket are
 * still untrusted — the bridge re-validates `effort` against the enum and treats
 * `model` opaquely (an unusable id surfaces as an `error` event).
 */
export interface ChatRequest {
  message: string;
  /** Continue a prior turn's Agent-SDK session so follow-ups keep context. */
  resume?: string;
  /** Model id. Omitted → bridge falls back to AI_BRIDGE_MODEL / SDK default. */
  model?: string;
  /** Reasoning effort. Omitted → SDK default. */
  effort?: EffortLevel;
}

/** One event streamed back from `POST /chat` for a single chat turn. */
export type BridgeEvent =
  | { type: "text"; text: string }
  | { type: "tool"; name: string }
  | {
      /**
       * A resolved tool call's result, structured for a preview card. `markdown`
       * always carries the full raw tool-result text (the graceful-degradation
       * fallback); `fields` is best-effort and may be absent or partial. `kind`
       * selects the card style — an unknown value is treated as "generic". A
       * `spell` card carries only its name in `title`; the widget re-renders it
       * from the bundled spell dataset (Wizard's-Tome styling), falling back to
       * `markdown` when the name isn't in the bundle.
       */
      type: "tool_result";
      tool: string;
      kind: "monster" | "character" | "generic" | "spell";
      title: string;
      fields?: Record<string, string>;
      /**
       * Character-only: the sheet's spell / weapon names, so an Add-to-Party
       * hand-off can populate those lists (the collision diff never shows them).
       * Absent for every other card kind.
       */
      spells?: string[];
      weapons?: string[];
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

/**
 * Response body of the bridge's `GET /health` probe.
 *
 * Only `billing` and `ddbMcpFound` are required by the widget, and its
 * validator (`isBridgeHealth`) checks exactly those — so a version-skewed
 * bridge renaming or dropping a cosmetic field degrades gracefully instead of
 * bricking AI Chat on an older deployed SPA. The rest are optional
 * diagnostics for humans (curl, the widget footer's future use).
 */
export interface BridgeHealth {
  /** How chat turns are billed ("subscription" | "apiKey"). Consumed. */
  billing: string;
  /** Whether the ddb-mcp entrypoint resolved (live DDB lookups work). Consumed. */
  ddbMcpFound: boolean;
  /**
   * The bridge's per-turn wall-clock cap in ms (server.ts TURN_TIMEOUT_MS,
   * operator-tunable via AI_BRIDGE_TURN_TIMEOUT_MS). Consumed: the widget's
   * client-side stall watchdog must sit *above* this so it can't abandon a turn
   * the bridge would still complete. Absent from pre-versioning bridges — the
   * client then falls back to its built-in floor.
   */
  turnTimeoutMs?: number;
  /**
   * Wire-contract revision, bumped on a breaking `/chat` or `/health` change so
   * a future client can detect skew explicitly. Absent from pre-versioning
   * bridges — treat missing as 1. The value lives in services/ai-bridge
   * (server.ts), not here: this package must stay types-only.
   */
  protocolVersion?: number;
  ok?: boolean;
  service?: string;
  allowedTools?: number;
  // NOTE: the resolved ddb-mcp path is deliberately NOT on the wire — it's an
  // absolute path under the DM's home directory, and /health should stay
  // readable-by-anything-local without leaking it. It prints on the bridge's
  // startup console instead.
}
