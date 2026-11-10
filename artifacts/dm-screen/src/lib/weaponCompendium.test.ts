import { describe, it, expect } from "vitest";

import { weaponsData, weaponMasteryRules, weaponPropertyRules } from "@/data/weapons";
import { compendiumData } from "@/data/compendium";
import { UNARMED_STRIKE, withUnarmedStrike } from "@/data/unarmedStrike";
import {
  findWeaponEntryId,
  isSpecialWeapon,
  SUPERSEDED_ENTRY_IDS,
  masteryRuleFor,
  propertyRuleFor,
  weaponCompendiumEntries,
  weaponForEntryId,
  weaponRange,
  weaponTypeLine,
  weaponVersatile,
  WEAPONS_CATEGORY,
} from "./weaponCompendium";

// Runs against the real generated weapons.ts — these double as checks that
// the regenerated data carries the 2024 mastery + rules text.
const byName = (n: string) => weaponsData.find((w) => w.name === n)!;

describe("generated weapon data", () => {
  it("carries 2024 Weapon Mastery on base weapons", () => {
    expect(byName("Dagger").mastery).toEqual(["Nick"]);
    expect(byName("Longsword").mastery).toEqual(["Sap"]);
    expect(byName("Longbow").mastery).toEqual(["Slow"]);
    expect(byName("Greataxe").mastery).toEqual(["Cleave"]);
  });

  it("lets magic weapons inherit mastery + melee/ranged from their base weapon", () => {
    const sickle = byName("+1 Moon Sickle");
    expect(sickle.mastery).toEqual(byName("Sickle").mastery);
    expect(sickle.kind).toBe("melee");
  });

  it("ships a definition for every 2024 mastery and every core property", () => {
    expect(weaponMasteryRules.map((r) => r.name)).toEqual([
      "Cleave", "Graze", "Nick", "Push", "Sap", "Slow", "Topple", "Vex",
    ]);
    for (const p of ["Ammunition", "Finesse", "Heavy", "Light", "Loading", "Reach", "Thrown", "Two-Handed", "Versatile"]) {
      expect(weaponPropertyRules.some((r) => r.name === p && r.description.length > 20)).toBe(true);
    }
  });

  it("labels every property code (no raw 5etools abbreviations leak through)", () => {
    const props = new Set(weaponsData.flatMap((w) => w.properties));
    for (const p of props) expect(p).not.toMatch(/^(AF|BF|Vst|RLD|LD|2H|[AFHLRSTV])$/);
    expect(props.has("Automatic")).toBe(false); // the old AF mislabel
  });
});

describe("weaponCompendiumEntries", () => {
  it("adds every weapon as a Weapons entry, resolvable by name case-insensitively", () => {
    const weaponEntries = weaponCompendiumEntries.filter((e) => e.category === WEAPONS_CATEGORY);
    expect(weaponEntries).toHaveLength(weaponsData.length + 1); // + Unarmed Strike
    const id = findWeaponEntryId("dAgGeR")!;
    expect(weaponForEntryId(id)?.name).toBe("Dagger");
    expect(findWeaponEntryId("Not A Weapon")).toBeNull();
  });

  it("makes a weapon searchable by damage, property and mastery", () => {
    const dagger = weaponCompendiumEntries.find((e) => e.title === "Dagger")!;
    expect(dagger.content).toMatch(/1d4 Piercing/);
    expect(dagger.tags).toEqual(expect.arrayContaining(["finesse", "nick", "simple", "melee"]));
  });

  it("adds property rules, but never duplicates a hand-curated title", () => {
    expect(weaponCompendiumEntries.some((e) => e.title === "Weapon Property: Finesse")).toBe(true);
    const curated = new Set(compendiumData.map((e) => e.title.toLowerCase()));
    for (const e of weaponCompendiumEntries) expect(curated.has(e.title.toLowerCase())).toBe(false);
    const ids = weaponCompendiumEntries.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("card helpers", () => {
  it("derives the type line, range and two-handed damage", () => {
    expect(weaponTypeLine(byName("Dagger"))).toBe("Simple Melee Weapon");
    expect(weaponRange(byName("Dagger"))).toBe("20/60");
    expect(weaponVersatile(byName("Longsword"))).toBe("1d10");
    expect(weaponVersatile(byName("Dagger"))).toBeNull();
  });

  it("explains a property chip as written on the weapon", () => {
    expect(propertyRuleFor("Versatile 1d10")?.name).toBe("Versatile");
    expect(propertyRuleFor("Finesse")?.name).toBe("Finesse");
    expect(propertyRuleFor("Ammunition (Firearm)")?.name).toBe("Ammunition (Firearm)");
    expect(propertyRuleFor("Range 20/60")?.description).toMatch(/Disadvantage/);
    expect(propertyRuleFor("Made Up")).toBeNull();
    expect(masteryRuleFor("nick")?.description).toMatch(/Light property/);
  });
});

describe("hand-curated Weapon Mastery entries (compendium.ts)", () => {
  // The curated entries list each mastery's weapons by hand; they once drifted
  // badly from the rules (Longsword under Slow, Spear under Vex, a non-2024
  // "Flex" mastery). Pin them to the generated data in both directions.
  const curated = compendiumData.filter((e) => e.title.startsWith("Weapon Mastery: "));

  // Mundane base weapons = no item text, plus the Lance (its mounted-combat
  // rule is stored as item text). Excluded: spellcasting-focus staves (usable
  // as a Quarterstaff, which IS listed) and the Soulknife's Psychic Blade (a
  // class feature, not a weapon you pick up).
  const ALSO_BASE = new Set(["Lance"]);
  const NOT_LISTED = new Set(["Staff", "Wooden Staff", "Psychic Blade"]);
  const baseWithMastery = (m: string) =>
    weaponsData
      .filter((w) => (!w.description || ALSO_BASE.has(w.name)) && w.mastery.includes(m))
      .filter((w) => !NOT_LISTED.has(w.name))
      .map((w) => w.name)
      .sort();

  const listed = (content: string) =>
    [...content.matchAll(/(?:Weapons|DMG firearms): ([^.]+)\./g)]
      .flatMap((m) => m[1].split(","))
      .map((n) => n.trim())
      .sort();

  it("covers exactly the eight 2024 masteries", () => {
    expect(curated.map((e) => e.title.replace("Weapon Mastery: ", "")).sort()).toEqual(
      weaponMasteryRules.map((r) => r.name).sort(),
    );
  });

  it.each(weaponMasteryRules.map((r) => r.name))("lists exactly the %s weapons", (m) => {
    const entry = curated.find((e) => e.title === `Weapon Mastery: ${m}`)!;
    expect(listed(entry.content)).toEqual(baseWithMastery(m));
  });
});

describe("Unarmed Strike", () => {
  it("is a Weapons entry with its own type line and the three 2024 options", () => {
    const id = findWeaponEntryId("unarmed strike")!;
    const w = weaponForEntryId(id)!;
    expect(w).toBe(UNARMED_STRIKE);
    expect(isSpecialWeapon(w) && w.options.map((o) => o.name)).toEqual(["Damage", "Grapple", "Shove"]);
    expect(weaponTypeLine(w)).toMatch(/every creature/);
    // Searchable by its options' text, not just its name.
    const entry = weaponCompendiumEntries.find((e) => e.id === id)!;
    expect(entry.content).toMatch(/Grappled condition/);
  });

  it("replaces the generated variant-rule entry instead of duplicating it", () => {
    expect(SUPERSEDED_ENTRY_IDS.has("variant-unarmed-strike")).toBe(true);
  });

  it("is listed first for every character, once, without touching their weapons", () => {
    expect(withUnarmedStrike([])).toEqual(["Unarmed Strike"]);
    expect(withUnarmedStrike(undefined)).toEqual(["Unarmed Strike"]);
    const own = ["Dagger", "unarmed strike", "Longbow"];
    expect(withUnarmedStrike(own)).toEqual(["Unarmed Strike", "Dagger", "Longbow"]);
    expect(own).toEqual(["Dagger", "unarmed strike", "Longbow"]);
  });
});
