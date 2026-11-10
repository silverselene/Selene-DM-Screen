import { describe, it, expect } from "vitest";

import { abilityMod, formatMod, proficiencyBonus } from "./abilities";
import { validatePartyCollapsed } from "./backup";

describe("character-sheet numbers", () => {
  it("derives ability modifiers", () => {
    expect([1, 8, 9, 10, 11, 12, 16, 20, 30].map(abilityMod)).toEqual([-5, -1, -1, 0, 0, 1, 3, 5, 10]);
  });

  it("formats modifiers like a printed sheet", () => {
    expect(formatMod(3)).toBe("+3");
    expect(formatMod(0)).toBe("+0");
    expect(formatMod(-1)).toBe("−1");
  });

  it("gives the proficiency bonus by level", () => {
    expect([1, 4, 5, 8, 9, 12, 13, 16, 17, 20].map(proficiencyBonus)).toEqual([2, 2, 3, 3, 4, 4, 5, 5, 6, 6]);
  });
});

describe("validatePartyCollapsed (backup restore)", () => {
  it("keeps valid character ids and drops junk", () => {
    expect(validatePartyCollapsed([3, "x", -1, 2.5, 7])).toEqual([3, 7]);
    expect(validatePartyCollapsed("nope")).toBeUndefined();
  });
});
