import { afterEach, describe, expect, it } from "vitest";
import { envPort, envTurnTimeoutMs, parseAllowedOrigins } from "./config";

describe("parseAllowedOrigins", () => {
  it("always includes the SPA's default :38080 origins", () => {
    const origins = parseAllowedOrigins(undefined);
    expect(origins.has("http://localhost:38080")).toBe(true);
    expect(origins.has("http://127.0.0.1:38080")).toBe(true);
    expect(origins.size).toBe(2);
  });

  it("adds comma-separated extra origins on top of the defaults", () => {
    const origins = parseAllowedOrigins("http://localhost:5173, https://dm.example.com");
    expect(origins.has("http://localhost:5173")).toBe(true);
    expect(origins.has("https://dm.example.com")).toBe(true);
    expect(origins.has("http://localhost:38080")).toBe(true);
  });

  it("strips trailing slashes (an Origin header never carries one)", () => {
    const origins = parseAllowedOrigins("https://dm.example.com/");
    expect(origins.has("https://dm.example.com")).toBe(true);
    expect(origins.has("https://dm.example.com/")).toBe(false);
  });

  it("lowercases entries to match the browser's always-lowercase Origin header", () => {
    const origins = parseAllowedOrigins("https://DM.Example.com");
    expect(origins.has("https://dm.example.com")).toBe(true);
    expect(origins.has("https://DM.Example.com")).toBe(false);
  });

  it("ignores empty segments and whitespace-only input", () => {
    expect(parseAllowedOrigins("  ,, ").size).toBe(2);
    expect(parseAllowedOrigins("").size).toBe(2);
  });
});

describe("envPort", () => {
  const VAR = "AI_BRIDGE_PORT_TEST";
  afterEach(() => {
    delete process.env[VAR];
  });

  it("falls back when the var is unset", () => {
    expect(envPort(VAR, 38900)).toBe(38900);
  });

  it("parses a valid port", () => {
    process.env[VAR] = "39000";
    expect(envPort(VAR, 38900)).toBe(39000);
  });

  // Fail-loudly parity with vite.config.ts: a silent fallback would let
  // AI_BRIDGE_PORT=0 bind an ephemeral port while the SPA bakes in :38900 —
  // a permanent "bridge offline" with no error anywhere.
  it("throws on port 0, out-of-range, and garbage values", () => {
    for (const bad of ["0", "-1", "65536", "abc", "38900abc", "1.5", ""]) {
      process.env[VAR] = bad;
      if (bad === "") {
        // Empty string is falsy → treated as unset, like vite.config's `portEnv ?`.
        expect(envPort(VAR, 38900)).toBe(38900);
      } else {
        expect(() => envPort(VAR, 38900), JSON.stringify(bad)).toThrow(/Invalid AI_BRIDGE_PORT_TEST/);
      }
    }
  });
});

describe("envTurnTimeoutMs", () => {
  afterEach(() => {
    delete process.env.AI_BRIDGE_TURN_TIMEOUT_MS;
  });

  it("falls back when the var is unset or empty", () => {
    expect(envTurnTimeoutMs(180_000)).toBe(180_000);
    process.env.AI_BRIDGE_TURN_TIMEOUT_MS = "";
    expect(envTurnTimeoutMs(180_000)).toBe(180_000);
  });

  it("parses a valid millisecond budget", () => {
    process.env.AI_BRIDGE_TURN_TIMEOUT_MS = "150";
    expect(envTurnTimeoutMs(180_000)).toBe(150);
  });

  // The headline bug: Node clamps a setTimeout delay above 2^31-1 (or Infinity)
  // to 1 ms, so an over-large budget turned every turn into a near-instant abort
  // AND serialized as `turnTimeoutMs: null` in /health. Fail loud like envPort
  // instead of silently degrading to a 1 ms outage.
  it("throws on values above the setTimeout ceiling (2^31-1), non-positive, and garbage", () => {
    for (const bad of ["2147483648", "99999999999", "Infinity", "0", "-1", "abc", "150abc", "1.5"]) {
      process.env.AI_BRIDGE_TURN_TIMEOUT_MS = bad;
      expect(() => envTurnTimeoutMs(180_000), JSON.stringify(bad)).toThrow(
        /Invalid AI_BRIDGE_TURN_TIMEOUT_MS/,
      );
    }
  });

  it("accepts the exact setTimeout ceiling", () => {
    process.env.AI_BRIDGE_TURN_TIMEOUT_MS = "2147483647";
    expect(envTurnTimeoutMs(180_000)).toBe(2_147_483_647);
  });
});
