import { describe, it, expect } from "vitest";

import { weaponsData, weaponMasteryRules, weaponPropertyRules } from "@/data/weapons";
import { compendiumData } from "@/data/compendium";
import {
  findWeaponEntryId,
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
    expect(weaponEntries).toHaveLength(weaponsData.length);
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
