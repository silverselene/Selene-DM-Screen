// Parser coverage for `statblockCombat.ts`. Pure logic, Node env.
//
// The fixtures here are verbatim `desc` strings from `src/data/monsters.ts` —
// not idealized examples — because the whole difficulty of this module is that
// the dataset merges three source styles with genuinely different grammar
// (2014 WotC, 2024 WotC, and Kobold Press / Level Up A5e via Open5e). A test
// written against clean invented prose would pass while the real dataset
// produced nothing. Each fixture below is labelled with the monster it came
// from so a future regen that changes a format can be traced back.
import { describe, it, expect } from "vitest";
import {
  deriveCombatOptions,
  findSpellsInText,
  formatDamage,
  formatDistance,
  formatToHit,
  parseDamage,
  parseSave,
  parseSpellGroups,
} from "@/lib/statblockCombat";
import type { MonsterTrait } from "@/data/monsters";

const action = (name: string, desc: string): MonsterTrait => ({ name, desc });

describe("attack line parsing", () => {
  it("reads the 2014 WotC form (A-mi-kuk, Bite)", () => {
    const { attacks } = deriveCombatOptions({
      actions: [
        action(
          "Bite",
          "Melee Weapon Attack: +8 to hit, reach 5 ft., one target. Hit: 12 (2d6 + 5) piercing damage.",
        ),
      ],
    });
    expect(attacks).toHaveLength(1);
    expect(attacks[0]).toMatchObject({
      name: "Bite",
      origin: "action",
      kind: "melee",
      isSpellAttack: false,
      toHit: 8,
      reach: "5 ft.",
      range: null,
    });
    expect(attacks[0].damage).toEqual([
      { average: 12, dice: "2d6 + 5", type: "piercing" },
    ]);
  });

  it("reads the 2024 WotC form, which drops 'to hit' and 'one target' (Aboleth, Tentacle)", () => {
    const { attacks } = deriveCombatOptions({
      actions: [
        action(
          "Tentacle",
          "Melee Attack Roll: +9, reach 15 ft. Hit: 12 (2d6 + 5) Bludgeoning damage. If the target is a Large or smaller creature, it has the Grappled condition (escape DC 14) from one of four tentacles.",
        ),
      ],
    });
    expect(attacks[0]).toMatchObject({ toHit: 9, reach: "15 ft.", kind: "melee" });
    // "(escape DC 14)" must not be read as a damage clause — the dice
    // character class is what excludes it.
    expect(attacks[0].damage).toEqual([
      { average: 12, dice: "2d6 + 5", type: "bludgeoning" },
    ]);
  });

  it("reads the compressed Open5e/A5e form with no 'Hit:' label (Abaasy, Iron Axe)", () => {
    const { attacks } = deriveCombatOptions({
      actions: [
        action(
          "Iron Axe",
          "Melee Weapon Attack: +8 to hit, 10 ft., one target, 18 (3d8+5) slashing damage.",
        ),
      ],
    });
    // The distance carries no `reach` keyword here; it is only read because
    // neither `reach` nor `range` appeared.
    expect(attacks[0]).toMatchObject({ toHit: 8, reach: "10 ft.", range: null });
    expect(formatDamage(attacks[0].damage)).toBe("18 (3d8+5) slashing");
  });

  it("reads a ranged attack's range band (2024 Ranged Attack Roll)", () => {
    const { attacks } = deriveCombatOptions({
      actions: [
        action(
          "Poison Dart",
          "Ranged Attack Roll: +7, range 80/320 ft. Hit: 8 (1d8 + 4) Piercing damage plus 21 (6d6) Poison damage.",
        ),
      ],
    });
    expect(attacks[0]).toMatchObject({ kind: "ranged", reach: null, range: "80/320 ft." });
    expect(formatDamage(attacks[0].damage)).toBe("8 (1d8 + 4) piercing + 21 (6d6) poison");
  });

  it("keeps both distances for a thrown weapon (Melee or Ranged Weapon Attack)", () => {
    const { attacks } = deriveCombatOptions({
      actions: [
        action(
          "Javelin",
          "Melee or Ranged Weapon Attack: +13 to hit, reach 5 ft. or range 20/60 ft., one target. Hit: 10 (1d6 + 7) piercing damage.",
        ),
      ],
    });
    expect(attacks[0].kind).toBe("melee-or-ranged");
    expect(formatDistance(attacks[0])).toBe("5 ft. or 20/60 ft.");
  });

  it("flags a spell attack so the UI does not call it a weapon", () => {
    const { attacks } = deriveCombatOptions({
      actions: [
        action(
          "Chill Touch",
          "Ranged Spell Attack: +7 to hit, range 120 ft., one creature. Hit: 9 (2d8) necrotic damage.",
        ),
      ],
    });
    expect(attacks[0].isSpellAttack).toBe(true);
    expect(attacks[0].weapon).toBeNull();
  });

  it("handles a negative to-hit without losing the sign", () => {
    const { attacks } = deriveCombatOptions({
      actions: [action("Flail", "Melee Weapon Attack: -1 to hit, reach 5 ft. Hit: 3 (1d8 - 1) bludgeoning damage.")],
    });
    expect(attacks[0].toHit).toBe(-1);
    expect(formatToHit(attacks[0].toHit)).toBe("-1");
  });

  it("attaches the bundled weapon entry when the action is a real weapon", () => {
    const { attacks } = deriveCombatOptions({
      actions: [
        action("Longsword", "Melee Weapon Attack: +5 to hit, reach 5 ft., one target. Hit: 7 (1d8 + 3) slashing damage."),
        action("Claw", "Melee Weapon Attack: +5 to hit, reach 5 ft., one target. Hit: 7 (1d8 + 3) slashing damage."),
      ],
    });
    expect(attacks[0].weapon).toMatchObject({
      name: "Longsword",
      category: "martial",
      damage: "1d8",
      damageType: "Slashing",
      // Properties carry their detail inline in the weapons dataset
      // ("Versatile 1d10", not "Versatile") — passed through verbatim.
      properties: ["Versatile 1d10"],
    });
    // A natural weapon is not in the weapons dataset and must not be
    // fuzzy-matched onto something that is.
    expect(attacks[1].weapon).toBeNull();
  });

  it("matches a weapon through a trailing qualifier", () => {
    const { attacks } = deriveCombatOptions({
      actions: [
        action("Spear (Two-Handed)", "Melee Weapon Attack: +5 to hit, reach 5 ft. Hit: 6 (1d8 + 2) piercing damage."),
      ],
    });
    expect(attacks[0].weapon?.name).toBe("Spear");
  });
});

describe("damage parsing", () => {
  it("declines to label a clause whose type the source dropped (Adult Cave Dragon, Bite)", () => {
    // Verbatim: the upstream text lost the first clause's "piercing". Guessing
    // "poison" from the following clause would be worse than saying nothing.
    const damage = parseDamage("Hit: 18 (3d6 + 8) plus 3 (1d6) poison damage.");
    expect(damage).toEqual([
      { average: 18, dice: "3d6 + 8", type: null },
      { average: 3, dice: "1d6", type: "poison" },
    ]);
    expect(formatDamage(damage)).toBe("18 (3d6 + 8) + 3 (1d6) poison");
  });

  it("falls back to flat damage when no dice are printed", () => {
    expect(parseDamage("Hit: 5 piercing damage.")).toEqual([
      { average: 5, dice: null, type: "piercing" },
    ]);
  });

  it("ignores parentheticals that are not dice", () => {
    expect(
      parseDamage("Hit: 7 (2d4 + 2) piercing damage, and the target is grappled (escape DC 13)."),
    ).toEqual([{ average: 7, dice: "2d4 + 2", type: "piercing" }]);
  });

  it("returns nothing rather than guessing when there is no damage at all", () => {
    expect(parseDamage("The target is pushed 10 feet away.")).toEqual([]);
  });

  it("caps a long action's dice so the summary stays a summary", () => {
    const damage = parseDamage(
      "Hit: 1 (1d4) fire damage plus 2 (1d4) cold damage plus 3 (1d4) acid damage " +
        "plus 4 (1d4) poison damage plus 5 (1d4) force damage plus 6 (1d4) necrotic damage.",
    );
    expect(damage).toHaveLength(4);
  });
});

describe("save parsing", () => {
  it("reads the 2024 block form", () => {
    expect(parseSave("Dexterity Saving Throw: DC 21, each creature in a 60-foot Cone. Failure: 54 (12d8) Fire damage."))
      .toEqual({ ability: "Dexterity", dc: 21 });
  });

  it("reads the abbreviated 2024 macro form (Adult Red Dragon, Fire Breath)", () => {
    // Verbatim. `stripTags` renders 5etools' `{@actSave dex}` as "Dex Save: ",
    // not "Dexterity Saving Throw:" — missing this spelling left every 2024
    // breath weapon and legendary save action unparsed.
    expect(
      parseSave("Dex Save: DC 21, each creature in a 60-foot Cone [Area of Effect]. Failure: 59 (17d6) Fire damage. Success: Half damage."),
    ).toEqual({ ability: "Dexterity", dc: 21 });
  });

  it("reads the 2014 sentence form", () => {
    expect(parseSave("Each creature must make a DC 18 Constitution saving throw."))
      .toEqual({ ability: "Constitution", dc: 18 });
  });

  it("expands the Open5e ability abbreviation", () => {
    expect(parseSave("target: DC 16 Str save or be knocked prone"))
      .toEqual({ ability: "Strength", dc: 16 });
  });

  it("records an attack's rider save without demoting it to a save action", () => {
    const { attacks, saveActions } = deriveCombatOptions({
      actions: [
        action(
          "Tail",
          "Melee Weapon Attack: +8 to hit, reach 10 ft., one target. Hit: 15 (4d4+5) bludgeoning damage and target: DC 16 Str save or be knocked prone.",
        ),
      ],
    });
    expect(attacks[0].save).toEqual({ ability: "Strength", dc: 16 });
    expect(saveActions).toHaveLength(0);
  });
});

describe("save-forcing actions", () => {
  it("captures a breath weapon, which makes no attack roll (Adult Red Dragon)", () => {
    const { attacks, saveActions } = deriveCombatOptions({
      actions: [
        action(
          "Fire Breath",
          "Dexterity Saving Throw: DC 21, each creature in a 60-foot Cone. Failure: 59 (17d6) Fire damage. Success: Half damage.",
        ),
      ],
    });
    expect(attacks).toHaveLength(0);
    expect(saveActions).toHaveLength(1);
    expect(saveActions[0]).toMatchObject({ name: "Fire Breath", save: { ability: "Dexterity", dc: 21 } });
    expect(formatDamage(saveActions[0].damage)).toBe("59 (17d6) fire");
  });

  it("keeps a damage-free save action (Frightful Presence)", () => {
    const { saveActions } = deriveCombatOptions({
      actions: [
        action(
          "Frightful Presence",
          "Each creature of the dragon's choice within 120 feet must succeed on a DC 19 Wisdom saving throw or become frightened for 1 minute.",
        ),
      ],
    });
    expect(saveActions[0]).toMatchObject({ save: { ability: "Wisdom", dc: 19 }, damage: [] });
  });

  it("leaves a non-offensive action out of both lists", () => {
    // Still visible in the Bestiary's existing Actions tab — omitted here only
    // so the Attacks view isn't padded with utility actions.
    const options = deriveCombatOptions({
      actions: [action("Change Shape", "The dragon magically polymorphs into a humanoid or beast.")],
    });
    expect(options.attacks).toHaveLength(0);
    expect(options.saveActions).toHaveLength(0);
  });

  it("tags a legendary action and a reaction with their origin", () => {
    const { attacks, saveActions } = deriveCombatOptions({
      legendaryActions: [
        action("Claw", "Melee Weapon Attack: +11 to hit, reach 10 ft. Hit: 13 (2d6 + 6) slashing damage."),
      ],
      reactions: [
        action("Parry Riposte", "Melee Weapon Attack: +7 to hit, reach 5 ft. Hit: 6 (1d8 + 2) slashing damage."),
        action("Warding Flare", "Each attacker must succeed on a DC 15 Wisdom saving throw."),
      ],
    });
    expect(attacks.map((a) => a.origin)).toEqual(["legendary", "reaction"]);
    expect(saveActions[0].origin).toBe("reaction");
  });

  it("lifts Multiattack out rather than parsing it as an attack", () => {
    const options = deriveCombatOptions({
      actions: [
        action("Multiattack", "The dragon makes three attacks: one with its bite and two with its claws."),
        action("Bite", "Melee Weapon Attack: +11 to hit, reach 10 ft. Hit: 17 (2d10 + 6) piercing damage."),
      ],
    });
    expect(options.multiattack).toContain("three attacks");
    expect(options.attacks.map((a) => a.name)).toEqual(["Bite"]);
  });

  it("does not treat a trait's attack reference as a separate attack", () => {
    // Traits describe when an existing action may be used, not a new one.
    const { attacks } = deriveCombatOptions({
      traits: [
        action("Pounce", "If the tiger moves 20 feet it can make one Melee Weapon Attack: +6 to hit, reach 5 ft. Hit: 8 (1d8 + 4) slashing damage."),
      ],
    });
    expect(attacks).toHaveLength(0);
  });
});

describe("spell name resolution", () => {
  it("prefers the longest name so a spell inside a spell is not mis-read", () => {
    // "lightning bolt" contains "light"; "mass cure wounds" contains "cure
    // wounds". Longest-first alternation ordering is what settles both.
    expect(findSpellsInText("lightning bolt, mass cure wounds, light").map((s) => s.name))
      .toEqual(["Lightning Bolt", "Mass Cure Wounds", "Light"]);
  });

  it("sees through markdown emphasis (2024 entries wrap names in underscores)", () => {
    expect(findSpellsInText("At Will: _dancing lights_, _minor illusion_").map((s) => s.name))
      .toEqual(["Dancing Lights", "Minor Illusion"]);
  });

  it("deduplicates a spell named twice", () => {
    expect(findSpellsInText("fireball and later fireball again")).toHaveLength(1);
  });

  it("returns nothing for prose that names no spell", () => {
    expect(findSpellsInText("Its spellcasting ability is Charisma.")).toEqual([]);
  });
});

describe("spellcasting groups", () => {
  it("splits the 2014 slot list (Ancient Brass Dragon)", () => {
    const groups = parseSpellGroups(
      "the dragon is a 6th-level spellcaster. Its spellcasting ability is Intelligence " +
        "(spell save DC 18, +10 to hit with spell attacks). The dragon has the following wizard spells prepared:\n\n" +
        "cantrips (at will): acid splash, light, mage hand, prestidigitation\n\n" +
        "1st level (4 slots): charm person, expeditious retreat, magic missile, unseen servant\n\n" +
        "3rd level (3 slots): haste, lightning bolt, protection from energy",
    );
    expect(groups.map((g) => g.label)).toEqual([
      "Cantrips (At Will)",
      "1st Level (4 Slots)",
      "3rd Level (3 Slots)",
    ]);
    expect(groups[0].spells.map((s) => s.name)).toEqual([
      "Acid Splash", "Light", "Mage Hand", "Prestidigitation",
    ]);
    expect(groups[2].spells.map((s) => s.name)).toEqual([
      "Haste", "Lightning Bolt", "Protection from Energy",
    ]);
  });

  it("opens a slot group even when the source omits the colon (Accursed Guardian Naga)", () => {
    // Verbatim: the 3rd-level header has no colon. With a colon required, its
    // spells were silently absorbed into the 2nd-level group — the DM saw
    // Clairvoyance listed as a 2nd-level slot.
    const groups = parseSpellGroups(
      " 2nd-level (3 slots): calm emotions\n hold person\n locate object\n" +
        " 3rd-level (3 slots) clairvoyance\n create food and water\n" +
        " 4th-level (3 slots): divination\n freedom of movement",
    );
    expect(groups.map((g) => g.label)).toEqual([
      "2nd Level (3 Slots)", "3rd Level (3 Slots)", "4th Level (3 Slots)",
    ]);
    expect(groups[0].spells.map((s) => s.name)).toEqual([
      "Calm Emotions", "Hold Person", "Locate Object",
    ]);
    expect(groups[1].spells.map((s) => s.name)).toEqual([
      "Clairvoyance", "Create Food and Water",
    ]);
  });

  it("still refuses a bare 'Nth level' with no colon and no slot count", () => {
    // "an 11th level spellcaster" is prose, not a header. If it opened a group,
    // the preamble would be scanned and its "light" listed as a known spell.
    const groups = parseSpellGroups(
      "The naga is an 11th level spellcaster who prays for light. At Will: mending",
    );
    expect(groups.map((g) => g.label)).toEqual(["At Will"]);
    expect(groups[0].spells.map((s) => s.name)).toEqual(["Mending"]);
  });

  it("splits an Open5e list whose spells are newline- not comma-separated (Accursed Naga)", () => {
    // Verbatim shape: the level header and its spells run together with "\n "
    // separators. Scanning for dataset names is indifferent to the separator,
    // which is the reason this module matches names instead of parsing commas.
    const groups = parseSpellGroups(
      "The naga has the following cleric spells prepared\n which it can cast with only vocalized components:\n" +
        " Cantrips (at will): mending\n thaumaturgy\n 1st-level (4 slots): command\n cure wounds\n false life\n" +
        " 2nd-level (3 slots): calm emotions\n hold person\n locate object",
    );
    expect(groups.map((g) => g.label)).toEqual([
      "Cantrips (At Will)", "1st Level (4 Slots)", "2nd Level (3 Slots)",
    ]);
    expect(groups[1].spells.map((s) => s.name)).toEqual([
      "Command", "Cure Wounds", "False Life",
    ]);
  });

  it("splits an innate list by uses per day", () => {
    const groups = parseSpellGroups(
      "It can innately cast the following spells:\n\nat will: tongues\n\n5/day each: dispel magic, enhance ability",
    );
    expect(groups.map((g) => g.label)).toEqual(["At Will", "5/Day Each"]);
    expect(groups[1].spells.map((s) => s.name)).toEqual(["Dispel Magic", "Enhance Ability"]);
  });

  it("normalizes the abbreviated 'ea' header", () => {
    expect(parseSpellGroups("3/day ea: bestow curse, enthrall")[0].label).toBe("3/Day Each");
  });

  it("reads the headers the monsters generator emits from a 5etools spellcasting block", () => {
    // Producer/consumer pair: `renderSpellcasting` in
    // scripts/src/data-generators/monsters-lib.ts writes these labels. If that
    // format changes, this test is where the app side notices.
    const groups = parseSpellGroups(
      "Constant: mage armor\n1/Rest: revivify\n2/Week: plane shift\n" +
        "Rituals: detect magic\nCantrips (at will): light\n1st level (1 slot): bless",
    );
    expect(groups.map((g) => g.label)).toEqual([
      "Constant", "1/Rest", "2/Week", "Rituals", "Cantrips (At Will)", "1st Level (1 Slot)",
    ]);
  });

  it("scans the whole body when there is no group header (Egret Harpy)", () => {
    // The one-liner innate form. Without this fallback these 14 entries would
    // resolve to no spells at all.
    const groups = parseSpellGroups(
      "The egret harpy can innately cast suggestion, requiring no material components. Its innate spellcasting ability is Charisma.",
    );
    expect(groups).toEqual([expect.objectContaining({ label: "Spells" })]);
    expect(groups[0].spells.map((s) => s.name)).toEqual(["Suggestion"]);
  });

  it("skips the preamble so its prose cannot seed false spell matches", () => {
    // "light" in "an 11th level spellcaster ... daylight hours" sits before the
    // first header and must not become a cantrip.
    const groups = parseSpellGroups(
      "The cultist prays for light during daylight hours. 1st level (2 slots): bane, shield",
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].spells.map((s) => s.name)).toEqual(["Bane", "Shield"]);
  });
});

describe("spellcasting blocks", () => {
  const dragonSpellcasting = action(
    "Spellcasting",
    "the dragon is a 6th-level spellcaster. Its spellcasting ability is Intelligence " +
      "(spell save DC 18, +10 to hit with spell attacks).\n\ncantrips (at will): light, mage hand\n\n" +
      "1st level (4 slots): magic missile, charm person",
  );

  it("reads the DC, attack bonus and ability off the block", () => {
    const { spellcasting, spellCount } = deriveCombatOptions({ traits: [dragonSpellcasting] });
    expect(spellcasting).toHaveLength(1);
    expect(spellcasting[0]).toMatchObject({
      name: "Spellcasting",
      origin: "trait",
      ability: "Intelligence",
      saveDc: 18,
      attackBonus: 10,
    });
    expect(spellCount).toBe(4);
  });

  it("finds spellcasting in the actions section too (2024 stat blocks moved it there)", () => {
    const { spellcasting } = deriveCombatOptions({ actions: [dragonSpellcasting] });
    expect(spellcasting[0].origin).toBe("action");
  });

  it("matches the variant trait names the dataset uses", () => {
    const { spellcasting } = deriveCombatOptions({
      traits: [
        action("Innate Spellcasting (3/Day)", "It can innately cast suggestion. Its spellcasting ability is Charisma (spell save DC 13)."),
      ],
    });
    expect(spellcasting[0].name).toBe("Innate Spellcasting (3/Day)");
    expect(spellcasting[0].groups[0].spells.map((s) => s.name)).toEqual(["Suggestion"]);
  });

  it("drops a 'Spellcasting'-named trait that is neither a spell list nor a DC (Alehouse Drake)", () => {
    const { spellcasting } = deriveCombatOptions({
      traits: [
        action(
          "Forgetful Spellcasting",
          "When a creature fails a saving throw against a spell cast by an alehouse drake, the creature immediately forgets the source of the spellcasting.",
        ),
      ],
    });
    expect(spellcasting).toEqual([]);
  });

  it("keeps a spellcasting block that states a DC but names no bundled spell", () => {
    // Homebrew/third-party spell names aren't in the 557 — the block is still
    // worth showing, and the UI renders its original text.
    const { spellcasting } = deriveCombatOptions({
      traits: [
        action("Spellcasting", "Its spellcasting ability is Wisdom (spell save DC 15).\n\n1/day each: aspect of the moon"),
      ],
    });
    expect(spellcasting[0].saveDc).toBe(15);
    expect(spellcasting[0].groups).toEqual([]);
    expect(spellcasting[0].desc).toContain("aspect of the moon");
  });

  it("never routes a spellcasting entry into the attack lists", () => {
    const options = deriveCombatOptions({
      actions: [
        action(
          "Spellcasting",
          "Its spellcasting ability is Charisma (spell save DC 16). 1/day each: fireball",
        ),
      ],
    });
    expect(options.attacks).toEqual([]);
    expect(options.saveActions).toEqual([]);
    expect(options.spellcasting).toHaveLength(1);
  });
});

describe("empty and thin inputs", () => {
  it("returns an empty derivation for a thin dataset entry", () => {
    expect(deriveCombatOptions({})).toEqual({
      attacks: [],
      saveActions: [],
      spellcasting: [],
      multiattack: null,
      spellCount: 0,
    });
  });

  it("preserves the source text on every parsed option", () => {
    const desc = "Melee Weapon Attack: +8 to hit, reach 5 ft. Hit: 12 (2d6 + 5) piercing damage.";
    const { attacks } = deriveCombatOptions({ actions: [action("Bite", desc)] });
    expect(attacks[0].desc).toBe(desc);
  });
});

describe("display helpers", () => {
  it("formats a signed to-hit", () => {
    expect(formatToHit(9)).toBe("+9");
    expect(formatToHit(0)).toBe("+0");
    expect(formatToHit(-2)).toBe("-2");
  });

  it("returns null distance rather than an empty string", () => {
    const { attacks } = deriveCombatOptions({
      actions: [action("Psychic Lash", "Melee Spell Attack: +7 to hit, one creature it can see. Hit: 9 (2d8) psychic damage.")],
    });
    expect(formatDistance(attacks[0])).toBeNull();
  });

  it("joins damage clauses with a separator a DM can read at a glance", () => {
    expect(
      formatDamage([
        { average: 12, dice: "2d6 + 5", type: "piercing" },
        { average: 4, dice: "1d8", type: "acid" },
      ]),
    ).toBe("12 (2d6 + 5) piercing + 4 (1d8) acid");
  });

  it("formats a clause missing its dice or its average", () => {
    expect(formatDamage([{ average: null, dice: "2d6", type: "fire" }])).toBe("2d6 fire");
    expect(formatDamage([{ average: 7, dice: null, type: null }])).toBe("7");
  });
});
