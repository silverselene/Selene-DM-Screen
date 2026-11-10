import { describe, it, expect } from "vitest";

import { cycleSkill, hasJackOfAllTrades, passivePerception, SKILLS, skillModifier } from "./skills";
import { SKILL_KEYS } from "@/types";

// Claude Skamos-ish: Wizard 2 (PB +2), INT 16 (+3), WIS 13 (+1), DEX 10 (+0).
const wizard = {
  class: "Wizard",
  level: 2,
  abilities: { str: 8, dex: 10, con: 12, int: 16, wis: 13, cha: 14 },
  skills: { arcana: "proficient", history: "expertise" } as const,
};

describe("skills", () => {
  it("covers all 18 skills, each tied to an ability", () => {
    expect(SKILLS.map((s) => s.key)).toEqual([...SKILL_KEYS]);
    expect(SKILLS.find((s) => s.key === "sleight-of-hand")!.ability).toBe("dex");
  });

  it("adds the proficiency bonus when proficient, double for Expertise", () => {
    expect(skillModifier(wizard, "arcana")).toBe(5); // +3 INT +2 PB
    expect(skillModifier(wizard, "history")).toBe(7); // +3 INT +4 (expertise)
    expect(skillModifier(wizard, "athletics")).toBe(-1); // STR 8, no prof
  });

  it("is unknown without the ability score", () => {
    expect(skillModifier({ ...wizard, abilities: null }, "arcana")).toBeNull();
    expect(passivePerception({ ...wizard, abilities: null })).toBeNull();
  });

  it("gives Passive Perception as 10 + Perception", () => {
    expect(passivePerception(wizard)).toBe(11);
    expect(passivePerception({ ...wizard, skills: { perception: "proficient" } })).toBe(13);
  });

  it("applies Jack of All Trades for Bards level 2+, including multiclass", () => {
    expect(hasJackOfAllTrades({ class: "Bard", level: 4 })).toBe(true);
    expect(hasJackOfAllTrades({ class: "Bard", level: 1 })).toBe(false);
    expect(hasJackOfAllTrades({ class: "Fighter 3 / Bard 2", level: 5 })).toBe(true);
    expect(hasJackOfAllTrades({ class: "Bard 1 / Rogue 4", level: 5 })).toBe(false);
    expect(hasJackOfAllTrades({ class: "Wizard", level: 9 })).toBe(false);
    // Bard 4 (PB +2): non-proficient skills get +1.
    const bard = { ...wizard, class: "Bard", level: 4, skills: null };
    expect(skillModifier(bard, "athletics")).toBe(0); // −1 STR + 1
  });

  it("cycles none → proficient → expertise → none", () => {
    const a = cycleSkill(null, "stealth");
    expect(a).toEqual({ stealth: "proficient" });
    const b = cycleSkill(a, "stealth");
    expect(b).toEqual({ stealth: "expertise" });
    expect(cycleSkill(b, "stealth")).toBeNull();
    expect(cycleSkill({ arcana: "proficient" }, "stealth")).toEqual({ arcana: "proficient", stealth: "proficient" });
  });
});
