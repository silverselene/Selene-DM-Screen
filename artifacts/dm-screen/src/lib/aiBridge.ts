// Client for the optional local AI bridge (services/ai-bridge). The bridge binds
// to 127.0.0.1:38900 and speaks HTTP + SSE: `GET /health` for a reachability /
// billing probe, and `POST /chat` streaming typed `text` / `tool` / `done` /
// `error` events. Everything here degrades gracefully when the bridge is not
// running — the chat widget shows a "start the bridge" state rather than hanging.

// The address the bridge binds in services/ai-bridge/src/config.ts. CORS on the
// bridge is `*` (it's 127.0.0.1-only), so the SPA at localhost:38080 can reach it.
export const BRIDGE_URL = "http://127.0.0.1:38900";

// The wire contract is defined once in @workspace/bridge-protocol and shared
// with the bridge (services/ai-bridge), so a producer/consumer drift is a
// compile error rather than a silent runtime mis-parse. Re-exported here so
// existing `@/lib/aiBridge` importers keep working unchanged.
import type { BridgeEvent, BridgeHealth } from "@workspace/bridge-protocol";
export type { BridgeEvent, BridgeHealth };

/**
 * Probe the bridge with a short timeout so the widget can flip to a clear
 * "bridge not running" state instead of spinning. A connection-refused, a
 * non-2xx, or a timeout all reject — the caller treats any rejection as offline.
 */
export async function checkHealth(timeoutMs = 2500): Promise<BridgeHealth> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${BRIDGE_URL}/health`, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`Bridge health check returned ${res.status}`);
    return (await res.json()) as BridgeHealth;
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
): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`${BRIDGE_URL}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // `resume` continues the prior turn's session so follow-ups keep context.
      body: JSON.stringify(resumeSessionId ? { message, resume: resumeSessionId } : { message }),
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
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let sep: number;
    // SSE records are delimited by a blank line ("\n\n").
    while ((sep = buffer.indexOf("\n\n")) !== -1) {
      const record = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      const event = parseSseRecord(record);
      if (event) onEvent(event);
    }
  }
  // Flush a trailing record with no final blank line (defensive).
  const tail = parseSseRecord(buffer);
  if (tail) onEvent(tail);
}

/** Turn `mcp__dndbeyond__ddb_get_character` into a human "Get character". */
export function friendlyToolName(name: string): string {
  const bare = name.replace(/^mcp__[^_]+__/, "").replace(/^ddb_/, "");
  const words = bare.replace(/_/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}
