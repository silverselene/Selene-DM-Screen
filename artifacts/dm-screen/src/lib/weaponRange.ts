// How far a weapon reaches: the normal / long range of a ranged or thrown
// weapon (its "Range 20/60" property) and the reach of a melee one (5 ft, or
// 10 ft with the Reach property). Kept apart from weaponCompendium.ts so the
// Party widget and the character sheet can use it without pulling in the
// Compendium's data.

import type { Weapon } from "@/data/weapons";

const RANGE_PROPERTY = /^Range\s+(.+)$/i;

/** True for the "Range 20/60" property, which the sheet and pills show as
 *  their own range badge rather than as a property chip. */
export function isRangeProperty(p: string): boolean {
  return RANGE_PROPERTY.test(p);
}

/** Normal / long range from a "Range 20/60" property, if any ("20/60"). */
export function weaponRange(w: Pick<Weapon, "properties">): string | null {
  for (const p of w.properties) {
    const m = p.match(RANGE_PROPERTY);
    if (m) return m[1];
  }
  return null;
}

/** Melee reach in feet — 10 with the Reach property, otherwise 5. Null for a
 *  weapon that isn't a melee weapon (or doesn't say). */
export function weaponReach(w: Pick<Weapon, "properties" | "kind">): number | null {
  if (w.kind !== "melee") return null;
  return w.properties.some((p) => p.trim().toLowerCase() === "reach") ? 10 : 5;
}

export interface WeaponDistance {
  /** Melee reach in feet, or null. */
  reach: number | null;
  /** Ranged / thrown range as "20/60", or null. */
  range: string | null;
}

export function weaponDistance(w: Pick<Weapon, "properties" | "kind">): WeaponDistance {
  return { reach: weaponReach(w), range: weaponRange(w) };
}

/** The one-number version for a tight spot (the Party row's weapon pill):
 *  the range when the weapon has one, else its reach — "20/60 ft" / "5 ft". */
export function weaponDistanceShort(w: Pick<Weapon, "properties" | "kind">): string | null {
  const { reach, range } = weaponDistance(w);
  if (range) return `${range} ft`;
  if (reach != null) return `${reach} ft`;
  return null;
}
