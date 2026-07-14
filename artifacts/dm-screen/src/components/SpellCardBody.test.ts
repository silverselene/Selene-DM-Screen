import { describe, expect, it } from "vitest";
import { spellEffectLine } from "./SpellCardBody";
import type { Spell } from "@/data/spells";

const base: Spell = {
  name: "Test Spell",
  level: 1,
  school: "Evocation",
  castingTime: "Action",
  range: "60 feet",
  components: "V, S",
  duration: "Instantaneous",
  classes: ["Wizard"],
  description: "…",
  damageSummary: "0 — Placeholder.",
};

describe("spellEffectLine", () => {
  it("labels a damage-dealer 'Damage' and keeps the dice summary verbatim", () => {
    const spell: Spell = {
      ...base,
      damage: { dice: "8d6", type: "fire" },
      damageSummary: "8d6 Fire (Dex save)",
    };
    expect(spellEffectLine(spell)).toEqual({ label: "Damage", value: "8d6 Fire (Dex save)" });
  });

  it("labels a healer 'Healing' and strips the '0 — Heals' prefix", () => {
    const spell: Spell = {
      ...base,
      healing: { dice: "2d8" },
      damageSummary: "0 — Heals 2d8",
    };
    expect(spellEffectLine(spell)).toEqual({ label: "Healing", value: "2d8" });
  });

  it("labels everything else 'Effect' and strips the '0 — ' prefix", () => {
    const spell: Spell = {
      ...base,
      damageSummary: "0 — You create up to four torch-size lights within range.",
    };
    expect(spellEffectLine(spell)).toEqual({
      label: "Effect",
      value: "You create up to four torch-size lights within range.",
    });
  });
});
