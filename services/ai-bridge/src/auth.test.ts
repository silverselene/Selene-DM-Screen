import { describe, expect, it } from "vitest";
import { resolveAuth, BridgeAuthError } from "./auth";

// Billing must never be ambiguous: each mode hands the SDK exactly one kind of
// credential, so /health's `billing` field can't lie about which pool is spent.
describe("resolveAuth credential scrubbing", () => {
  it("subscription mode strips metered credentials, keeps the OAuth token", () => {
    const auth = resolveAuth({
      ANTHROPIC_API_KEY: "sk-meter",
      ANTHROPIC_AUTH_TOKEN: "tok-meter",
      CLAUDE_CODE_OAUTH_TOKEN: "oauth-sub",
      PATH: "/usr/bin",
    });
    expect(auth.mode).toBe("subscription");
    expect(auth.env.ANTHROPIC_API_KEY).toBeUndefined();
    expect(auth.env.ANTHROPIC_AUTH_TOKEN).toBeUndefined();
    expect(auth.env.CLAUDE_CODE_OAUTH_TOKEN).toBe("oauth-sub");
    expect(auth.env.PATH).toBe("/usr/bin");
  });

  it("apiKey mode strips every non-metered credential, keeps only the metered key", () => {
    const auth = resolveAuth({
      AI_BRIDGE_ALLOW_API_KEY: "1",
      ANTHROPIC_API_KEY: "sk-meter",
      CLAUDE_CODE_OAUTH_TOKEN: "oauth-sub",
      // A bearer token that could otherwise route billing to a gateway/subscription
      // pool and make /health's `billing: "apiKey"` a lie — must be scrubbed too.
      ANTHROPIC_AUTH_TOKEN: "tok-bearer",
      PATH: "/usr/bin",
    });
    expect(auth.mode).toBe("apiKey");
    expect(auth.env.ANTHROPIC_API_KEY).toBe("sk-meter");
    expect(auth.env.CLAUDE_CODE_OAUTH_TOKEN).toBeUndefined();
    expect(auth.env.ANTHROPIC_AUTH_TOKEN).toBeUndefined();
    expect(auth.env.PATH).toBe("/usr/bin");
  });

  it("apiKey mode without a key is a hard setup error, not a silent fallback", () => {
    expect(() => resolveAuth({ AI_BRIDGE_ALLOW_API_KEY: "true" })).toThrow(BridgeAuthError);
  });
});
