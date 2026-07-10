import type { ChatRequest, EffortLevel } from "@workspace/bridge-protocol";

// The three effort levels the widget exposes and the bridge honors. Kept as a
// runtime set here (the shared @workspace/bridge-protocol is types-only, so it
// can't carry the allowlist) to validate the untrusted request body.
const VALID_EFFORTS: ReadonlySet<EffortLevel> = new Set<EffortLevel>(["low", "medium", "high"]);

const MESSAGE_REQUIRED = 'Body must be JSON: { "message": "<non-empty string>" }';

export type ParseResult =
  | { ok: true; value: ChatRequest }
  | { ok: false; error: string };

/**
 * Parse and validate the untrusted `POST /chat` body. Pure (string in, result
 * out) so it can be unit-tested without the HTTP layer.
 *
 * - `message` is required and must be a non-empty (post-trim) string.
 * - `resume`/`model` are forwarded only when they're non-empty strings.
 * - `effort` is forwarded only when it is exactly one of the three valid levels;
 *   anything else (an SDK level we don't expose like `xhigh`/`max`, or garbage
 *   from a rogue local caller) is dropped so the turn falls back to the default.
 */
export function parseChatRequest(raw: string): ParseResult {
  let parsed: { message?: unknown; resume?: unknown; model?: unknown; effort?: unknown };
  try {
    parsed = JSON.parse(raw) as typeof parsed;
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Invalid JSON body" };
  }

  if (typeof parsed.message !== "string" || parsed.message.trim() === "") {
    return { ok: false, error: MESSAGE_REQUIRED };
  }

  const value: ChatRequest = { message: parsed.message };
  if (typeof parsed.resume === "string" && parsed.resume !== "") value.resume = parsed.resume;
  if (typeof parsed.model === "string" && parsed.model !== "") value.model = parsed.model;
  if (typeof parsed.effort === "string" && VALID_EFFORTS.has(parsed.effort as EffortLevel)) {
    value.effort = parsed.effort as EffortLevel;
  }
  return { ok: true, value };
}
