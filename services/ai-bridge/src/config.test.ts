import { afterEach, describe, expect, it } from "vitest";
import { envPort, parseAllowedOrigins } from "./config";

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
