// Weapons as Compendium entries. The Compendium merges three sources at the
// widget layer (see CompendiumWidget.tsx): the DM's hand-curated summaries
// (compendium.ts), the generated bulk rules (compendiumRules.ts), and — from
// this module — the 251 bundled weapons plus the official weapon property
// and Weapon Mastery definitions generated alongside them (weapons.ts).
//
// Same precedence rule as generate-compendium.ts: a generated rule entry is
// skipped when the hand-curated compendium already has an entry with the same
// (normalized) title, so the DM's own wording always wins in the list. The
// weapon card itself always explains a property / mastery with the official
// text from weapons.ts (`propertyRuleFor` / `masteryRuleFor`).

import type { CompendiumEntry } from "@/data/compendium";
import { compendiumData } from "@/data/compendium";
import {
  weaponMasteryRules,
  weaponPropertyRules,
  weaponsData,
  type Weapon,
  type WeaponRule,
} from "@/data/weapons";
import { UNARMED_STRIKE, type SpecialWeapon } from "@/data/unarmedStrike";

export const WEAPONS_CATEGORY = "Weapons";

/** Hand-curated weapon-like attacks listed alongside the generated weapons. */
const SPECIAL_WEAPONS: SpecialWeapon[] = [UNARMED_STRIKE];

/** Every weapon the Compendium lists: the specials first, then the dataset. */
const ALL_WEAPONS: Weapon[] = [...SPECIAL_WEAPONS, ...weaponsData];

export function isSpecialWeapon(w: Weapon): w is SpecialWeapon {
  return "options" in w && Array.isArray((w as SpecialWeapon).options);
}

/** Generated Compendium entries a richer weapon entry replaces, so a search
 *  doesn't list the same thing twice. The 2024 "Unarmed Strike" variant rule
 *  is the same text as the Unarmed Strike weapon card's three options. */
export const SUPERSEDED_ENTRY_IDS = new Set(["variant-unarmed-strike"]);
export const WEAPON_PROPERTIES_CATEGORY = "Weapon Properties";
export const WEAPON_MASTERIES_CATEGORY = "Weapon Masteries";

const norm = (s: string) => s.trim().toLowerCase();

/** Stable across regenerations (weapon `id`s are sort-order indexes, and
 *  the selected entry id is persisted), unique because the generator
 *  dedupes weapons by lowercased name. */
export const weaponEntryId = (name: string) => `weapon:${norm(name)}`;

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** "Simple Melee Weapon", "Martial Ranged Weapon", "Weapon" — or a special
 *  weapon's own line ("Melee attack — every creature can make one"). */
export function weaponTypeLine(w: Pick<Weapon, "category" | "kind">): string {
  const special = (w as Partial<SpecialWeapon>).typeLine;
  if (special) return special;
  return [w.category && cap(w.category), w.kind && cap(w.kind), "Weapon"]
    .filter(Boolean)
    .join(" ");
}

export { weaponRange } from "@/lib/weaponRange";

/** Two-handed damage from a "Versatile 1d10" property, if any. */
export function weaponVersatile(w: Pick<Weapon, "properties">): string | null {
  for (const p of w.properties) {
    const m = p.match(/^Versatile\s+(\S+)/i);
    if (m) return m[1];
  }
  return null;
}

function summarize(w: Weapon): string {
  const lines = [
    `${weaponTypeLine(w)}.`,
    w.damage ? `Damage: ${w.damage}${w.damage_type ? ` ${w.damage_type}` : ""}.` : null,
    w.properties.length ? `Properties: ${w.properties.join(", ")}.` : null,
    w.mastery?.length ? `Mastery: ${w.mastery.join(", ")}.` : null,
    [w.weight, w.cost].filter(Boolean).join(", ") || null,
  ];
  const options = isSpecialWeapon(w)
    ? w.options.map((o) => `${o.name}: ${o.description}`).join("\n")
    : null;
  return [lines.filter(Boolean).join(" "), w.description, options].filter(Boolean).join("\n\n");
}

function weaponEntry(w: Weapon): CompendiumEntry {
  return {
    id: weaponEntryId(w.name),
    title: w.name,
    category: WEAPONS_CATEGORY,
    content: summarize(w),
    tags: [
      "weapon",
      w.category,
      w.kind,
      w.damage_type?.toLowerCase(),
      ...w.properties.map((p) => p.toLowerCase()),
      ...(w.mastery ?? []).map((m) => m.toLowerCase()),
    ].filter((t): t is string => Boolean(t)),
  };
}

const curatedTitles = new Set(compendiumData.map((e) => norm(e.title)));

function ruleEntry(prefix: string, category: string, r: WeaponRule): CompendiumEntry | null {
  const title = `${prefix}: ${r.name}`;
  if (curatedTitles.has(norm(title))) return null; // the DM's wording wins
  return {
    id: `${category === WEAPON_MASTERIES_CATEGORY ? "weapon-mastery" : "weapon-property"}:${norm(r.name)}`,
    title,
    category,
    content: r.description,
    tags: [norm(r.name), category === WEAPON_MASTERIES_CATEGORY ? "weapon mastery" : "weapon property", "2024"],
  };
}

export const weaponCompendiumEntries: CompendiumEntry[] = [
  ...ALL_WEAPONS.map(weaponEntry),
  ...weaponPropertyRules
    .map((r) => ruleEntry("Weapon Property", WEAPON_PROPERTIES_CATEGORY, r))
    .filter((e): e is CompendiumEntry => e != null),
  ...weaponMasteryRules
    .map((r) => ruleEntry("Weapon Mastery", WEAPON_MASTERIES_CATEGORY, r))
    .filter((e): e is CompendiumEntry => e != null),
];

const WEAPON_BY_ENTRY_ID = new Map<string, Weapon>(
  ALL_WEAPONS.map((w) => [weaponEntryId(w.name), w]),
);

export function weaponForEntryId(id: string): Weapon | undefined {
  return WEAPON_BY_ENTRY_ID.get(id);
}

/** Entry id for a weapon name (case-insensitive), or null if not bundled. */
export function findWeaponEntryId(name: string): string | null {
  const id = weaponEntryId(name);
  return WEAPON_BY_ENTRY_ID.has(id) ? id : null;
}

const PROPERTY_RULES = [...weaponPropertyRules].sort(
  (a, b) => b.name.length - a.name.length, // longest first: "Ammunition (Firearm)" before "Ammunition"
);

/** Rules text explaining a property chip as it appears on a weapon —
 *  "Versatile 1d8" → Versatile, "Reload 6" → Reload. "Range 20/60" isn't a
 *  property in the rules (it's the weapon's range), so it gets the core
 *  range rule. */
export function propertyRuleFor(chip: string): WeaponRule | null {
  const c = norm(chip);
  if (/^range\b/.test(c)) return RANGE_RULE;
  return (
    PROPERTY_RULES.find((r) => c === norm(r.name) || c.startsWith(`${norm(r.name)} `)) ?? null
  );
}

export function masteryRuleFor(name: string): WeaponRule | null {
  return weaponMasteryRules.find((r) => norm(r.name) === norm(name)) ?? null;
}

const RANGE_RULE: WeaponRule = {
  name: "Range",
  description:
    "The first number is the weapon's normal range in feet, the second its long range. " +
    "Attacking a target beyond normal range imposes Disadvantage on the attack roll, " +
    "and you can't attack a target beyond the long range.",
};
