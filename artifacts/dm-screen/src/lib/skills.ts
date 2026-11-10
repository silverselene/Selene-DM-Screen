// The 18 skills of the 2024 Player's Handbook and the numbers a character
// sheet derives from them.

import type { AbilityKey, PlayerCharacter, SkillKey, SkillLevel } from "@/types";
import { abilityMod, proficiencyBonus } from "@/lib/abilities";

export const SKILLS: readonly { key: SkillKey; label: string; ability: AbilityKey }[] = [
  { key: "acrobatics", label: "Acrobatics", ability: "dex" },
  { key: "animal-handling", label: "Animal Handling", ability: "wis" },
  { key: "arcana", label: "Arcana", ability: "int" },
  { key: "athletics", label: "Athletics", ability: "str" },
  { key: "deception", label: "Deception", ability: "cha" },
  { key: "history", label: "History", ability: "int" },
  { key: "insight", label: "Insight", ability: "wis" },
  { key: "intimidation", label: "Intimidation", ability: "cha" },
  { key: "investigation", label: "Investigation", ability: "int" },
  { key: "medicine", label: "Medicine", ability: "wis" },
  { key: "nature", label: "Nature", ability: "int" },
  { key: "perception", label: "Perception", ability: "wis" },
  { key: "performance", label: "Performance", ability: "cha" },
  { key: "persuasion", label: "Persuasion", ability: "cha" },
  { key: "religion", label: "Religion", ability: "int" },
  { key: "sleight-of-hand", label: "Sleight of Hand", ability: "dex" },
  { key: "stealth", label: "Stealth", ability: "dex" },
  { key: "survival", label: "Survival", ability: "wis" },
];

type SkillSource = Pick<PlayerCharacter, "abilities" | "skills" | "level" | "class">;

/** Bard levels from the class line: "Bard" (single class → total level) or
 *  "Bard 3 / Rogue 2" (multiclass → the Bard number). */
function bardLevel(c: Pick<PlayerCharacter, "class" | "level">): number {
  const cls = c.class ?? "";
  const multi = cls.match(/\bbard\s+(\d+)/i);
  if (multi) return Number(multi[1]);
  return /^\s*bard\s*$/i.test(cls) ? c.level : 0;
}

/** Jack of All Trades (Bard 2+): half the proficiency bonus, rounded down,
 *  on any skill check the character isn't proficient in. */
export function hasJackOfAllTrades(c: Pick<PlayerCharacter, "class" | "level">): boolean {
  return bardLevel(c) >= 2;
}

export function skillLevel(c: Pick<PlayerCharacter, "skills">, key: SkillKey): SkillLevel | null {
  return c.skills?.[key] ?? null;
}

/** The skill's modifier, or null when the governing ability score is unknown. */
export function skillModifier(c: SkillSource, key: SkillKey): number | null {
  const skill = SKILLS.find((s) => s.key === key);
  const score = skill ? c.abilities?.[skill.ability] : null;
  if (score == null || !skill) return null;
  const pb = proficiencyBonus(c.level);
  const level = skillLevel(c, key);
  const prof =
    level === "expertise" ? pb * 2
    : level === "proficient" ? pb
    : hasJackOfAllTrades(c) ? Math.floor(pb / 2)
    : 0;
  return abilityMod(score) + prof;
}

/** 10 + Perception modifier, or null without a Wisdom score. */
export function passivePerception(c: SkillSource): number | null {
  const mod = skillModifier(c, "perception");
  return mod == null ? null : 10 + mod;
}

/** Next state when the DM clicks a skill's circle: none → proficient →
 *  expertise → none. Returns the new skills map (null when empty). */
export function cycleSkill(
  skills: PlayerCharacter["skills"],
  key: SkillKey,
): PlayerCharacter["skills"] {
  const next: Partial<Record<SkillKey, SkillLevel>> = { ...(skills ?? {}) };
  const cur = next[key];
  if (!cur) next[key] = "proficient";
  else if (cur === "proficient") next[key] = "expertise";
  else delete next[key];
  return Object.keys(next).length ? next : null;
}
