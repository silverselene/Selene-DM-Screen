// Client for the optional local AI bridge (services/ai-bridge). The bridge binds
// to 127.0.0.1:38900 and speaks HTTP + SSE: `GET /health` for a reachability /
// billing probe, and `POST /chat` streaming typed `text` / `tool` / `done` /
// `error` events. Everything here degrades gracefully when the bridge is not
// running — the chat widget shows a "start the bridge" state rather than hanging.

// The address the bridge binds in services/ai-bridge/src/config.ts. The bridge
// deliberately does NOT send wildcard CORS: it reflects only an allowlisted
// Origin (its ALLOWED_ORIGINS — the SPA's :38080 origins plus anything in the
// AI_BRIDGE_ALLOWED_ORIGINS env var) and 403s every other browser origin, so a
// random web page can't spend the DM's subscription.
//
// The URL is baked in at dev/build time from the SAME AI_BRIDGE_PORT env var
// the bridge reads (see the `define` block in vite.config.ts), so
// `AI_BRIDGE_PORT=39000 pnpm dev` moves both sides together. The fallback
// covers Vitest (whose standalone config has no define). Remaining coupling:
// the Docker CSP connect-src in docker/security-headers.conf must list this
// URL or the widget's fetches are blocked in the container, and the bridge's
// ALLOWED_ORIGINS must include whatever origin serves this SPA.
export const BRIDGE_URL: string = import.meta.env.AI_BRIDGE_URL ?? "http://127.0.0.1:38900";

// The wire contract is defined once in @workspace/bridge-protocol and shared
// with the bridge (services/ai-bridge), so a producer/consumer drift is a
// compile error rather than a silent runtime mis-parse. Re-exported here so
// existing `@/lib/aiBridge` importers keep working unchanged.
import type { BridgeEvent, BridgeHealth, ChatRequest, EffortLevel } from "@workspace/bridge-protocol";
export type { BridgeEvent, BridgeHealth, ChatRequest, EffortLevel };

/**
 * Build the `POST /chat` request body, including `resume`/`model` only when
 * they're non-empty and `effort` only when set. Pure and exported so the field
 * assembly is unit-tested independently of `fetch`.
 */
export function buildChatBody(
  message: string,
  resume?: string,
  model?: string,
  effort?: EffortLevel,
): ChatRequest {
  const body: ChatRequest = { message };
  if (resume) body.resume = resume;
  if (model) body.model = model;
  if (effort) body.effort = effort;
  return body;
}

/**
 * Validate a decoded `/health` body is a usable `BridgeHealth`. The bytes are
 * as untrusted as the SSE stream — a different local process could sit on
 * :38900, or the bridge could drift — so we check the fields the widget
 * actually consumes (`billing`, `ddbMcpFound`) rather than blindly casting,
 * keeping it from rendering `undefined` billing. Deliberately NOT stricter:
 * requiring every cosmetic field would turn benign version skew (a newer
 * bridge renaming a diagnostic field) into total widget unavailability.
 */
export function isBridgeHealth(value: unknown): value is BridgeHealth {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.billing === "string" && typeof v.ddbMcpFound === "boolean";
}

/**
 * The bridge is RUNNING but refused this page's origin (403 from its CORS
 * allowlist). Distinct from BridgeUnreachableError so the widget can say "add
 * this origin to AI_BRIDGE_ALLOWED_ORIGINS" instead of the misleading "bridge
 * not running" — the two states have opposite remedies.
 */
export class BridgeOriginError extends Error {
  constructor() {
    super("The AI bridge refused this page's origin.");
    this.name = "BridgeOriginError";
  }
}

/**
 * Probe the bridge with a short timeout so the widget can flip to a clear
 * "bridge not running" state instead of spinning. A connection-refused, a
 * non-2xx, a timeout, or a malformed body all reject — the caller treats any
 * rejection as offline, except a 403 (BridgeOriginError: the bridge is up but
 * this SPA's origin isn't in its allowlist).
 */
export async function checkHealth(timeoutMs = 2500): Promise<BridgeHealth> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${BRIDGE_URL}/health`, { signal: ctrl.signal });
    if (res.status === 403) throw new BridgeOriginError();
    if (!res.ok) throw new Error(`Bridge health check returned ${res.status}`);
    const body: unknown = await res.json();
    if (!isBridgeHealth(body)) throw new Error("Bridge health response was malformed");
    return body;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Validate that a decoded `data:` payload is a well-formed `BridgeEvent`. The
 * bytes on the socket are untrusted (a local process could sit on :38900, or the
 * bridge could drift ahead of this client), so we check the discriminant AND the
 * required field of each variant rather than trusting a bare `type` string. An
 * unrecognized `type` — e.g. a new event this older client doesn't know — fails
 * safe (returns false → the record is dropped instead of mis-rendered).
 */
export function isBridgeEvent(value: unknown): value is BridgeEvent {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  switch (v.type) {
    case "text":
      return typeof v.text === "string";
    case "tool":
      return typeof v.name === "string";
    case "tool_result":
      // `kind` is intentionally not constrained to the known union here — an
      // unknown kind still validates and the card renders it as generic, so a
      // future bridge adding a card kind doesn't get dropped by an older client.
      return (
        typeof v.tool === "string" &&
        typeof v.kind === "string" &&
        typeof v.title === "string" &&
        typeof v.markdown === "string"
      );
    case "tool_error":
      return typeof v.tool === "string" && typeof v.message === "string";
    case "done":
      return typeof v.result === "string" && typeof v.subtype === "string";
    case "error":
      return typeof v.message === "string";
    default:
      return false;
  }
}

/**
 * Parse one SSE record (the text between two blank-line delimiters) into a
 * `BridgeEvent`. The bridge always encodes the full event object (including its
 * `type`) in the `data:` line, so we ignore the redundant `event:` line and just
 * decode `data:`. Returns null for comments/keep-alives, unparseable records, or
 * anything that isn't a valid `BridgeEvent`. Pure — unit-tested independently of
 * the network in phase 8.
 */
export function parseSseRecord(record: string): BridgeEvent | null {
  const dataLines = record
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).replace(/^ /, ""));
  if (dataLines.length === 0) return null;
  try {
    const parsed: unknown = JSON.parse(dataLines.join("\n"));
    return isBridgeEvent(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export class BridgeUnreachableError extends Error {
  constructor(cause?: unknown) {
    super("Could not reach the AI bridge.");
    this.name = "BridgeUnreachableError";
    if (cause !== undefined) this.cause = cause;
  }
}

// Stall watchdog for the chat stream: if no bytes arrive for this long, give
// up instead of showing "Thinking…" forever (a wedged bridge process, a
// half-dead socket). Must sit ABOVE the bridge's own per-turn wall-clock cap
// (TURN_TIMEOUT_MS): a healthy bridge always speaks first — either turn events
// or its timeout `error` event — so this only fires when the server has truly
// gone dark. Cancelling the reader also tears down the connection, which the
// bridge notices and uses to abort the in-flight turn (its `res.on("close")`).
//
// This is only the FLOOR, used when /health doesn't report a turn cap (an older
// bridge). The bridge cap is operator-tunable via AI_BRIDGE_TURN_TIMEOUT_MS, so
// when /health does report it, `stallTimeoutForTurn` sizes the watchdog above
// that value instead — otherwise raising the server cap past this constant would
// let the client abandon a turn the bridge would still complete.
export const STREAM_STALL_TIMEOUT_MS = 200_000;

// Headroom the watchdog keeps above the bridge's reported turn cap, so a turn
// that legitimately runs right up to the cap still gets its timeout `error`
// event delivered before the client gives up.
export const STREAM_STALL_MARGIN_MS = 20_000;

// Ceiling on the trust extended to the bridge's reported turn cap. The value
// arrives over the wire from whatever sits on :38900, so an absurd or garbage
// number (Number.MAX_VALUE, a typo'd env var with an extra digit) must not be
// allowed to effectively disable the stall watchdog — a wedged bridge would
// then show "Thinking…" forever. 30 minutes comfortably exceeds any sane
// AI_BRIDGE_TURN_TIMEOUT_MS; an operator raising the cap past this accepts
// that the client may abandon (and thereby cancel) a longer-running turn.
export const MAX_TRUSTED_TURN_TIMEOUT_MS = 30 * 60 * 1000;

/**
 * Client stall-watchdog timeout for a turn, given the bridge's reported per-turn
 * cap (`BridgeHealth.turnTimeoutMs`, possibly absent/untrusted). Always the
 * larger of the built-in floor and `min(cap, ceiling) + margin`, so the client
 * never abandons a turn the bridge would still complete under any sane
 * AI_BRIDGE_TURN_TIMEOUT_MS — while an untrusted/garbage cap can't disable the
 * watchdog outright (see MAX_TRUSTED_TURN_TIMEOUT_MS).
 */
export function stallTimeoutForTurn(turnTimeoutMs?: number): number {
  const cap =
    typeof turnTimeoutMs === "number" && Number.isFinite(turnTimeoutMs) && turnTimeoutMs > 0
      ? Math.min(turnTimeoutMs, MAX_TRUSTED_TURN_TIMEOUT_MS)
      : 0;
  return Math.max(STREAM_STALL_TIMEOUT_MS, cap + STREAM_STALL_MARGIN_MS);
}

/**
 * Send one chat turn and invoke `onEvent` for each streamed `BridgeEvent`.
 * Resolves when the stream ends. Throws `BridgeUnreachableError` if the bridge
 * can't be contacted (so the widget can suggest starting it), or a plain Error
 * for a bridge-reported failure (e.g. a 400 bad request). Pass an `AbortSignal`
 * to cancel the turn; an abort surfaces as a DOMException the caller can ignore.
 */
export async function streamChat(
  message: string,
  onEvent: (event: BridgeEvent) => void,
  signal?: AbortSignal,
  resumeSessionId?: string,
  model?: string,
  effort?: EffortLevel,
  stallTimeoutMs: number = STREAM_STALL_TIMEOUT_MS,
): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`${BRIDGE_URL}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // `resume` continues the prior turn's session so follow-ups keep context;
      // `model`/`effort` select the model and reasoning depth for this turn.
      body: JSON.stringify(buildChatBody(message, resumeSessionId, model, effort)),
      signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    // fetch rejects (TypeError) on connection-refused / DNS / network drop.
    throw new BridgeUnreachableError(err);
  }

  if (!res.ok) {
    let detail = `Bridge returned ${res.status}`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body?.error) detail = body.error;
    } catch {
      /* non-JSON error body — keep the status-code message */
    }
    throw new Error(detail);
  }
  if (!res.body) throw new BridgeUnreachableError();

  const reader = res.body.getReader();
  // Re-armed on every received chunk; on expiry, cancelling the reader resolves
  // the pending read() as done so the loop exits, then `stalled` turns the
  // silent end into a thrown, user-visible error.
  let stalled = false;
  let stallTimer: ReturnType<typeof setTimeout> | undefined;
  const armStallTimer = () => {
    clearTimeout(stallTimer);
    stallTimer = setTimeout(() => {
      stalled = true;
      void reader.cancel().catch(() => {});
    }, stallTimeoutMs);
  };
  const decoder = new TextDecoder();
  let buffer = "";
  // A healthy turn always ends with a terminal event (`done`, or the bridge's
  // own `error`). A stream that closes CLEANLY without one — the bridge process
  // killed mid-turn, a proxy dropping the connection with a graceful FIN —
  // would otherwise resolve normally and present whatever partial text made it
  // through as a finished answer the DM might act on mid-session.
  let terminal = false;
  const dispatch = (event: BridgeEvent) => {
    if (event.type === "done" || event.type === "error") terminal = true;
    onEvent(event);
  };
  try {
    armStallTimer();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      armStallTimer();
      buffer += decoder.decode(value, { stream: true });
      let sep: number;
      // SSE records are delimited by a blank line ("\n\n").
      while ((sep = buffer.indexOf("\n\n")) !== -1) {
        const record = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        const event = parseSseRecord(record);
        if (event) dispatch(event);
      }
    }
  } finally {
    clearTimeout(stallTimer);
  }
  if (stalled) {
    throw new Error(
      `The bridge stopped responding (no data for ${Math.round(stallTimeoutMs / 1000)}s), so this turn was abandoned. Try again.`,
    );
  }
  // Flush a trailing record with no final blank line (defensive).
  const tail = parseSseRecord(buffer);
  if (tail) dispatch(tail);
  if (!terminal) {
    throw new Error(
      "The connection to the bridge closed before the reply finished — the answer above may be incomplete. Try again.",
    );
  }
}

/**
 * Turn `mcp__dndbeyond__ddb_get_character` into a human "Get character".
 *
 * The bridge has a sibling `humanizeToolName` (services/ai-bridge/toolResults.ts)
 * that does the same for card titles. They are intentionally NOT shared: the one
 * cross-package module is `@workspace/bridge-protocol`, which is types-only and
 * erased from the browser bundle, so it can't hold runtime code. Keep the two in
 * sync by hand if the humanization rule changes.
 */
export function friendlyToolName(name: string): string {
  const bare = name.replace(/^mcp__[^_]+__/, "").replace(/^ddb_/, "");
  const words = bare.replace(/_/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}
