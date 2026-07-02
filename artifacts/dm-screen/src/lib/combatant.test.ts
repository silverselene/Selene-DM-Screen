import { describe, it, expect } from "vitest";
import {
  MAX_COMBATANTS,
  mintCombatantId,
  validateCombatants,
  validateInitiativeActiveId,
} from "./combatant";

describe("mintCombatantId", () => {
  it("produces the c-<suffix> shape", () => {
    expect(mintCombatantId()).toMatch(/^c-[a-z0-9]+$/);
  });

  it("does not collide across many mints", () => {
    const ids = new Set(Array.from({ length: 5000 }, () => mintCombatantId()));
    // Allow for the astronomically unlikely random clash, but it should be rare
    // enough that 5000 mints stay effectively unique.
    expect(ids.size).toBeGreaterThan(4990);
  });
});

describe("validateInitiativeActiveId", () => {
  it("treats null as the legitimate 'no active combatant' value", () => {
    expect(validateInitiativeActiveId(null)).toBeNull();
  });

  it("passes a clean id through", () => {
    expect(validateInitiativeActiveId("c-abc123")).toBe("c-abc123");
  });

  it("rejects empty, over-long, and non-string ids", () => {
    expect(validateInitiativeActiveId("")).toBeUndefined();
    expect(validateInitiativeActiveId("x".repeat(65))).toBeUndefined();
    expect(validateInitiativeActiveId(42)).toBeUndefined();
    expect(validateInitiativeActiveId(undefined)).toBeUndefined();
  });
});

describe("validateCombatants", () => {
  it("rejects a non-array outright", () => {
    expect(validateCombatants("nope")).toBeUndefined();
    expect(validateCombatants({})).toBeUndefined();
  });

  it("drops non-object elements instead of making empty rows", () => {
    const out = validateCombatants(["goblin", 3, null, { name: "Orc" }]);
    expect(out).toHaveLength(1);
    expect(out?.[0].name).toBe("Orc");
  });

  it("coerces NaN / non-numeric hp, maxHp, initiative to 0", () => {
    const [c] = validateCombatants([
      { name: "X", hp: "foo", maxHp: NaN, initiative: undefined },
    ])!;
    expect(c.hp).toBe(0);
    expect(c.maxHp).toBe(0);
    expect(c.initiative).toBe(0);
  });

  it("mints an id when missing or malformed, preserving valid ones", () => {
    const out = validateCombatants([
      { name: "Keep", id: "c-keep" },
      { name: "Mint", id: "" },
      { name: "MintToo" },
    ])!;
    expect(out[0].id).toBe("c-keep");
    expect(out[1].id).toMatch(/^c-/);
    expect(out[2].id).toMatch(/^c-/);
  });

  it("renumbers duplicate ids so no two combatants share one (finding #1 defense)", () => {
    const out = validateCombatants([
      { name: "A", id: "dup" },
      { name: "B", id: "dup" },
      { name: "C", id: "dup" },
    ])!;
    const ids = out.map((c) => c.id);
    expect(new Set(ids).size).toBe(3);
    // The first occurrence keeps the original id; later collisions are reminted.
    expect(ids[0]).toBe("dup");
    expect(ids[1]).not.toBe("dup");
    expect(ids[2]).not.toBe("dup");
  });

  it("truncates a pathologically long list to MAX_COMBATANTS", () => {
    const huge = Array.from({ length: MAX_COMBATANTS + 50 }, (_, i) => ({
      name: `C${i}`,
    }));
    expect(validateCombatants(huge)).toHaveLength(MAX_COMBATANTS);
  });
});
