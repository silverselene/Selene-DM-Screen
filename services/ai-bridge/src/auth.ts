/**
 * Auth resolution for the bridge.
 *
 * Policy (decided with James, 2026-07-07): **prefer the Claude subscription,
 * never silently fall back to metered API billing.**
 *
 * - Default ("subscription") mode strips ANTHROPIC_API_KEY / ANTHROPIC_AUTH_TOKEN
 *   from the environment handed to the Agent SDK subprocess, so the bundled
 *   Claude Code binary authenticates with the DM's own subscription — either a
 *   CLAUDE_CODE_OAUTH_TOKEN from `claude setup-token`, or an existing interactive
 *   `claude` login in ~/.claude. This guarantees a stray ANTHROPIC_API_KEY in the
 *   shell can never quietly route usage to pay-as-you-go API billing.
 * - Metered API billing is used ONLY when explicitly opted in via
 *   AI_BRIDGE_ALLOW_API_KEY (and only then is ANTHROPIC_API_KEY passed through).
 *
 * Context: as of 2026-07-07 the Agent SDK's subscription/OAuth path is no longer
 * documented (docs list only API-key methods) but still functions and still
 * draws on subscription limits (support.claude.com/en/articles/15036540 — the
 * June-15 change to a separate credit pool remains paused). See the epic
 * handover doc, decision 1.
 */

export type AuthMode = "subscription" | "apiKey";

export interface ResolvedAuth {
  mode: AuthMode;
  /** Environment to hand the Agent SDK subprocess. */
  env: Record<string, string>;
  /** Human-readable description of how usage will be billed. */
  note: string;
}

export class BridgeAuthError extends Error {
  override name = "BridgeAuthError";
}

function isTruthy(v: string | undefined): boolean {
  if (!v) return false;
  const s = v.trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes" || s === "on";
}

/** Drop undefined values so the result satisfies Record<string, string>. */
function clean(env: NodeJS.ProcessEnv): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(env)) {
    if (v !== undefined) out[k] = v;
  }
  return out;
}

export function resolveAuth(env: NodeJS.ProcessEnv = process.env): ResolvedAuth {
  const allowApiKey = isTruthy(env.AI_BRIDGE_ALLOW_API_KEY);

  if (allowApiKey) {
    if (!env.ANTHROPIC_API_KEY) {
      throw new BridgeAuthError(
        "AI_BRIDGE_ALLOW_API_KEY is set but ANTHROPIC_API_KEY is empty. " +
          "Set ANTHROPIC_API_KEY, or unset AI_BRIDGE_ALLOW_API_KEY to use your Claude subscription.",
      );
    }
    // Mirror of subscription mode's scrub: with more than one credential
    // present, which one bills would depend on SDK-internal precedence — and
    // /health's `billing: "apiKey"` could then be a lie. Strip *every* non-metered
    // credential (the subscription OAuth token AND ANTHROPIC_AUTH_TOKEN, a bearer
    // token that can route to a gateway/subscription pool) so the opted-in
    // ANTHROPIC_API_KEY is the only credential the SDK can see.
    const scrubbedApi = clean(env);
    delete scrubbedApi.CLAUDE_CODE_OAUTH_TOKEN;
    delete scrubbedApi.ANTHROPIC_AUTH_TOKEN;
    return {
      mode: "apiKey",
      env: scrubbedApi,
      note: "metered Claude API billing (ANTHROPIC_API_KEY — explicitly opted in)",
    };
  }

  // Subscription-preferred: never let a metered credential leak into the SDK.
  const scrubbed = clean(env);
  delete scrubbed.ANTHROPIC_API_KEY;
  delete scrubbed.ANTHROPIC_AUTH_TOKEN;

  const via = env.CLAUDE_CODE_OAUTH_TOKEN
    ? "CLAUDE_CODE_OAUTH_TOKEN (claude setup-token)"
    : "your interactive Claude Code login (~/.claude)";

  return {
    mode: "subscription",
    env: scrubbed,
    note: `Claude subscription via ${via}`,
  };
}

/**
 * Best-effort setup hint printed at startup. We can't reliably detect an
 * interactive login (macOS stores it in the Keychain), so this is advisory —
 * the authoritative failure surfaces on the first chat turn if truly
 * unauthenticated.
 */
export function setupHint(auth: ResolvedAuth): string | undefined {
  if (auth.mode === "apiKey") return undefined;
  if (process.env.CLAUDE_CODE_OAUTH_TOKEN) return undefined;
  return (
    "No CLAUDE_CODE_OAUTH_TOKEN set — relying on an existing `claude` login. " +
    "If chat turns fail with an auth error, run `claude setup-token` and export " +
    "the value as CLAUDE_CODE_OAUTH_TOKEN, or log in with the `claude` CLI."
  );
}
