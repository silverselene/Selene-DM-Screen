import { describe, expect, it } from "vitest";
import { parseAllowedOrigins } from "./config";

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
