import { describe, it, expect } from "vitest";
import { nameKey, sameName } from "./names";

describe("nameKey", () => {
  it("trims and lowercases", () => {
    expect(nameKey("  aRaGoRn ")).toBe("aragorn");
  });

  it("is idempotent", () => {
    expect(nameKey(nameKey("  Aragorn "))).toBe(nameKey("  Aragorn "));
  });

  it("leaves internal whitespace alone", () => {
    // Deliberate: "Bilbo  Baggins" and "Bilbo Baggins" are different people as
    // far as the roster is concerned. Documented here so a future collapse is
    // a conscious change to this rule, not an accident.
    expect(nameKey("Bilbo  Baggins")).not.toBe(nameKey("Bilbo Baggins"));
  });
});

describe("sameName", () => {
  it("matches case- and whitespace-insensitively", () => {
    expect(sameName("Aragorn", "  aRaGoRn ")).toBe(true);
  });

  it("does not match different names", () => {
    expect(sameName("Aragorn", "Legolas")).toBe(false);
  });

  it("treats two blank names as the same key", () => {
    expect(sameName("", "   ")).toBe(true);
  });
});
