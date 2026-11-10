// Numbers a character sheet derives from ability scores and level.

import type { AbilityKey } from "@/types";

export const ABILITY_LABELS: Record<AbilityKey, { short: string; long: string }> = {
  str: { short: "STR", long: "Strength" },
  dex: { short: "DEX", long: "Dexterity" },
  con: { short: "CON", long: "Constitution" },
  int: { short: "INT", long: "Intelligence" },
  wis: { short: "WIS", long: "Wisdom" },
  cha: { short: "CHA", long: "Charisma" },
};

export const abilityMod = (score: number): number => Math.floor((score - 10) / 2);

/** "+2", "−1", "+0" (true minus sign, as printed sheets use). */
export function formatMod(n: number): string {
  return n < 0 ? `−${Math.abs(n)}` : `+${n}`;
}

/** Proficiency bonus by total character level: +2 at 1–4 … +6 at 17–20. */
export function proficiencyBonus(level: number): number {
  const lvl = Math.max(1, Math.min(20, Math.trunc(level) || 1));
  return 2 + Math.floor((lvl - 1) / 4);
}
