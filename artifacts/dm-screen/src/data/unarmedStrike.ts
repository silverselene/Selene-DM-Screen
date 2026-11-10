// Unarmed Strike — hand-curated, not generated. In the 2024 rules it's a rule
// (PHB 2024 "Unarmed Strike"), not an item, so it isn't in 5etools' items
// data that weapons.ts is generated from. It's shaped like a Weapon so the
// Compendium can show it as a weapon card and the Party widget can list it
// on every character (anyone can make an Unarmed Strike), with the three
// 2024 options — Damage, Grapple, Shove — in the official wording.

import type { Weapon } from "@/data/weapons";

export interface WeaponOption {
  name: string;
  description: string;
}

/** A Weapon plus the extras a non-item attack like Unarmed Strike needs. */
export interface SpecialWeapon extends Weapon {
  /** Replaces the "Simple Melee Weapon" line on the card. */
  typeLine: string;
  /** Extra key numbers shown beside damage. */
  stats: { label: string; value: string }[];
  /** Choices made each time it's used, shown as their own blocks. */
  options: WeaponOption[];
  /** Footnote under the options. */
  note: string;
}

export const UNARMED_STRIKE_NAME = "Unarmed Strike";

export const UNARMED_STRIKE: SpecialWeapon = {
  id: 0,
  name: UNARMED_STRIKE_NAME,
  category: null,
  damage: "1 + Str",
  damage_type: "Bludgeoning",
  weight: null,
  properties: [],
  cost: null,
  description:
    "Instead of using a weapon to make a melee attack, you can use a punch, kick, head-butt, " +
    "or similar forceful blow against a target within 5 feet of you. Each time, choose one of " +
    "the options below.",
  is_homebrew: false,
  kind: "melee",
  mastery: [],
  typeLine: "Melee attack — every creature can make one",
  stats: [
    { label: "To hit", value: "Str mod + Proficiency" },
    { label: "Reach", value: "5 ft." },
  ],
  options: [
    {
      name: "Damage",
      description:
        "You make an attack roll against the target. Your bonus to the roll equals your Strength " +
        "modifier plus your Proficiency Bonus. On a hit, the target takes Bludgeoning damage equal " +
        "to 1 plus your Strength modifier.",
    },
    {
      name: "Grapple",
      description:
        "The target must succeed on a Strength or Dexterity saving throw (it chooses which), or it " +
        "has the Grappled condition. The DC for the save and any escape attempts equals 8 plus your " +
        "Strength modifier and Proficiency Bonus. Only possible if the target is no more than one " +
        "size larger than you and you have a hand free to grab it.",
    },
    {
      name: "Shove",
      description:
        "The target must succeed on a Strength or Dexterity saving throw (it chooses which), or you " +
        "either push it 5 feet away or give it the Prone condition. The DC equals 8 plus your " +
        "Strength modifier and Proficiency Bonus. Only possible if the target is no more than one " +
        "size larger than you.",
    },
  ],
  note:
    "Some features change the damage: a Monk's Martial Arts, the Unarmed Fighting fighting style, " +
    "and the Tavern Brawler feat.",
};

const isUnarmed = (name: string) => name.trim().toLowerCase() === UNARMED_STRIKE_NAME.toLowerCase();

/** A character's weapons as displayed: Unarmed Strike first (everyone has
 *  one), then their own weapons — without a second copy if they also list
 *  it by hand. Display-only; the stored roster is never changed. */
export function withUnarmedStrike(weapons: readonly string[] | undefined): string[] {
  return [UNARMED_STRIKE_NAME, ...(weapons ?? []).filter((w) => !isUnarmed(w))];
}
