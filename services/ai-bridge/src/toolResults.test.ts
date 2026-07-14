import { describe, it, expect } from "vitest";
import { parseToolResult, extractToolResultText } from "./toolResults";

const MONSTER_MD = `# Goblin
*Small humanoid, neutral evil*

**Armor Class** 15 (leather armor, shield)
**Hit Points** 7 (2d6)
**Speed** 30 ft.

**STR** 8 (-1) | **DEX** 14 (+2) | **CON** 10 (+0) | **INT** 10 (+0) | **WIS** 8 (-1) | **CHA** 8 (-1)

**Skills** Stealth +6
**Senses** darkvision 60 ft., passive Perception 9
**Languages** Common, Goblin
**Challenge** 1/4 (50 XP)

---
## Actions

**Scimitar.** Melee Attack: +4 to hit, 5 (1d6 + 2) slashing damage.`;

const CHARACTER_TXT = `═══════════════════════════════════════
  Thorin Ironforge
  Mountain Dwarf | Fighter (Champion) 5 | Level 5
  Background: Soldier | XP: 6500
  Inspiration: No
═══════════════════════════════════════

HP: 44/44   Temp HP: —   Prof Bonus: +3
Hit Dice: 5d10 (5 remaining)
AC: 18   Initiative: +2   Speed: 25 ft.`;

// A `full`-section sheet carrying ACTIONS (weapon attacks) and SPELLS blocks.
const CHARACTER_FULL_TXT = `═══════════════════════════════════════
  Elaria Moonwhisper
  High Elf | Wizard 6 | Level 6
═══════════════════════════════════════

HP: 32/32   Temp HP: —   Prof Bonus: +3
AC: 12   Initiative: +2   Speed: 30 ft.

ACTIONS
• Quarterstaff      +2 to hit   1d6 bludgeoning   reach 5 ft.
• ×2 Dagger          +5 to hit   1d4+3 piercing   range 20/60 ft.   Finesse, Light
• Longbow of the Deep Woods +5 to hit   1d8+3 piercing   range 150/600 ft.

BONUS ACTIONS
• Misty Step

SPELLCASTING
  Spell Save DC 14

SPELLS
  Cantrips: Fire Bolt, Mage Hand
  Spells: Fireball (L3), Shield (L1 [ritual]), Magic Missile (L1)
  From Race: Fire Bolt`;

// A real `full` sheet captured from ddb_get_character (Bard 4). Trimmed to the
// sections the parsers touch, but every retained line is verbatim — it exercises
// the real DDB format: a weapon name with a comma ("Crossbow, Light"), the
// "From Racial Trait:" spell-source label, a ⚠ warning + explanatory "• …"
// bullet inside the SPELLS block, and the SPELLS→EQUIPPED section boundary.
const REAL_BARD_SHEET = `═══════════════════════════════════════
  Barakas Skamos
  Tiefling (Abyssal) | Bard (College of Lore) 4 | Level 4
═══════════════════════════════════════

HP: 23/23   Temp HP: —   Prof Bonus: +2
AC: 12   Initiative: +3   Speed: 30 ft.

ACTIONS
• Dragon Slayer Rapier +2 to hit   1d8+2 piercing   reach 5 ft.   Finesse, Vex
• Dagger           +3 to hit   1d4+1 piercing   reach 5 ft.   Finesse, Light, Thrown, Nick
• Crossbow, Light  +3 to hit   1d8+1 piercing   range 80/320 ft.   Ammunition, Loading, Range, Two-Handed, Slow

BONUS ACTIONS
• Bardic Inspiration

REACTIONS
• Opportunity Attack
• Cutting Words

SPELLCASTING
  Bard: CHA  Spell Attack: +4  Save DC: 12

SPELL SLOTS
  Level 1: 4/4
  Level 2: 3/3

SPELLS
  From Racial Trait: Thaumaturgy, Poison Spray, Ray of Sickness (L1)
  ⚠ Duplicate spell grants detected — the following spells are already
  provided by an earlier source; the extra grant may be a wasted choice:
  • Ray of Sickness (L1) — already granted by Racial Trait, also in Racial Trait

EQUIPPED
  Leather (AC 11)

INVENTORY
  Spider Venom, Vial of Dragon Blood, Potion of Scaled Skin, Ink (1 ounce bottle)`;

// A real `full` sheet captured from ddb_get_character (Wizard 2), trimmed to the
// parsed sections (the `Spells:` list is shortened but every retained line is
// verbatim). Exercises the `Cantrips:` line, a multi-entry `Spells:` line with
// `(L1 [ritual])`/`(L1)` annotations, `From Feat:` as a source label, and
// apostrophe names. Note: the attack cantrip Fire Bolt lives in SPELLS, not
// ACTIONS — real ddb_get_character output keeps attack cantrips out of ACTIONS.
const REAL_WIZARD_SHEET = `═══════════════════════════════════════
  Claude Skamos
  Tiefling (Infernal) | Wizard 2 | Level 2
═══════════════════════════════════════

HP: 10/10   Temp HP: —   Prof Bonus: +2
AC: 10   Initiative: +0   Speed: 30 ft.

ACTIONS
• Dagger           +2 to hit   1d4 piercing   reach 5 ft.   Finesse, Light, Thrown, Nick
• Quarterstaff     +1 to hit   1d6-1 bludgeoning   reach 5 ft.   Versatile, Topple

REACTIONS
• Opportunity Attack
• Shield (spell, 1st-level slot)

SPELLCASTING
  Wizard: INT  Spell Attack: +5  Save DC: 13

SPELL SLOTS
  Level 1: 1/3

SPELLS
  Cantrips: Mage Hand, Light, Message
  Spells: Comprehend Languages (L1 [ritual]), Detect Magic (L1 [ritual]), Magic Missile (L1), Shield (L1), Tenser's Floating Disk (L1 [ritual]), Chromatic Orb (L1), Grease (L1)
  From Racial Trait: Thaumaturgy, Fire Bolt
  From Feat: Dancing Lights, Mending, Tasha's Hideous Laughter (L1)

INVENTORY
  Potion of Healing ×2, Spellbook, Parchment ×18`;

// A real `combat`-section sheet from ddb_get_character (Warlock 9). Verbatim.
// Two regression points: (1) "Shortsword, +1" is a weapon name carrying BOTH a
// comma and a "+1" bonus right before the to-hit number, and (2) a Warlock's
// Eldritch Blast never appears in ACTIONS — DDB keeps attack cantrips out of it —
// so the ACTIONS parse yields only real weapons, and the "(spell, …)" bonus /
// reaction bullets are excluded (no "to hit").
const REAL_WARLOCK_SHEET = `═══════════════════════════════════════
  Weslocke
  Tiefling | Warlock (The Fiend) 9 | Level 9
═══════════════════════════════════════

HP: 66/66   Temp HP: —   Prof Bonus: +4
AC: 14   Initiative: +3   Speed: 30 ft.

ACTIONS
• Shortsword, +1   +4 to hit   1d6+4 piercing   reach 5 ft.   Finesse, Light, Vex
• Dagger           +7 to hit   1d4+3 piercing   reach 5 ft.   Finesse, Light, Thrown, Nick

BONUS ACTIONS
• Hex (spell, 1st-level slot)

REACTIONS
• Opportunity Attack
• Hellish Rebuke (spell, 1st-level slot)`;

// Corpus-derived edge cases (from ddb-mcp/testcharacters.md). A caster whose
// ACTIONS block is "(none)" must yield no weapons, while spells still parse.
const SHEET_NO_ACTIONS = `═══════════════════════════════════════
  Ancarno Arnault
  High Elf | Sorcerer 2 | Level 2
═══════════════════════════════════════

ACTIONS
  (none)

BONUS ACTIONS
• Convert Sorcery Points

SPELLS
  Cantrips: Fire Bolt, Ray of Frost
  Spells: Burning Hands (L1)
  From Racial Trait: Minor Illusion

EQUIPPED`;

// A spell-conjured "weapon" (Spiritual Weapon) lives in BONUS ACTIONS with no
// 'to hit', so it stays a spell and never displaces the real Mace weapon —
// the spell-exclusion guard has nothing to drop here.
const SHEET_SPELL_WEAPON = `═══════════════════════════════════════
  Sister Baronessa
  Variant Human | Cleric (Trickery Domain) 9 | Level 9
═══════════════════════════════════════

ACTIONS
• Mace             +3 to hit   1d6-1 bludgeoning   reach 5 ft.   Sap

BONUS ACTIONS
• Spiritual Weapon (spell, 2nd-level slot)

SPELLS
  Cantrips: Sacred Flame
  Spells: Spiritual Weapon (L2), Bless (L1)

EQUIPPED`;

const SPELL_TXT = `**Fireball** — Level 3 Evocation [Concentration]
Casting Time: 1 Action
Range: 150 ft (20-ft Sphere)
Components: V, S, M (a tiny ball of bat guano and sulfur)
Duration: Instantaneous

A bright streak flashes from your pointing finger…`;

describe("parseToolResult — monster", () => {
  const ev = parseToolResult("ddb_get_monster", MONSTER_MD)!;
  it("classifies as a monster card", () => {
    expect(ev.type).toBe("tool_result");
    expect(ev.kind).toBe("monster");
    expect(ev.tool).toBe("ddb_get_monster");
  });
  it("extracts the title from the # heading", () => {
    expect(ev.title).toBe("Goblin");
  });
  it("extracts summary fields", () => {
    expect(ev.fields).toMatchObject({
      type: "Small humanoid, neutral evil",
      ac: "15 (leather armor, shield)",
      hp: "7 (2d6)",
      speed: "30 ft.",
      cr: "1/4 (50 XP)",
    });
  });
  it("keeps the full raw markdown", () => {
    expect(ev.markdown).toBe(MONSTER_MD);
  });
});

describe("parseToolResult — character", () => {
  const ev = parseToolResult("ddb_get_character", CHARACTER_TXT)!;
  it("classifies as a character card", () => {
    expect(ev.kind).toBe("character");
  });
  it("extracts name/race/class/level", () => {
    expect(ev.title).toBe("Thorin Ironforge");
    expect(ev.fields).toMatchObject({
      race: "Mountain Dwarf",
      class: "Fighter (Champion) 5",
      level: "5",
      background: "Soldier",
      hp: "44/44",
      ac: "18",
      initiative: "+2",
      speed: "25 ft.",
    });
  });
});

describe("parseToolResult — character spells/weapons", () => {
  const ev = parseToolResult("ddb_get_character", CHARACTER_FULL_TXT);
  it("extracts weapon names from the ACTIONS block", () => {
    // ×N prefixes stripped; long names (single-space before "+N to hit")
    // parsed; non-weapon bullets (Misty Step) excluded.
    expect(ev?.weapons).toEqual([
      "Quarterstaff",
      "Dagger",
      "Longbow of the Deep Woods",
    ]);
  });
  it("extracts spell names with the (L#) annotation stripped and de-duped", () => {
    expect(ev?.spells).toEqual([
      "Fire Bolt",
      "Mage Hand",
      "Fireball",
      "Shield",
      "Magic Missile",
    ]);
  });
  it("omits spells/weapons on a summary-only sheet", () => {
    const summary = parseToolResult("ddb_get_character", CHARACTER_TXT);
    expect(summary?.spells).toBeUndefined();
    expect(summary?.weapons).toBeUndefined();
  });
  it("does not count an attack cantrip in ACTIONS as a weapon", () => {
    // Fire Bolt carries a `to hit` in ACTIONS but is really a spell (it's in the
    // SPELLS block), so it must not land in the weapons list.
    const txt = `═══════════════════════════════════════
  Test Caster
  High Elf | Wizard 6 | Level 6
═══════════════════════════════════════

ACTIONS
• Dagger          +5 to hit   1d4+3 piercing
• Fire Bolt       +7 to hit   2d10 fire

SPELLS
  Cantrips: Fire Bolt, Mage Hand
  Spells: Fireball (L3)`;
    const ev = parseToolResult("ddb_get_character", txt);
    expect(ev?.weapons).toEqual(["Dagger"]);
    expect(ev?.spells).toContain("Fire Bolt");
  });
  it("does not count a `to hit` bullet outside ACTIONS as a weapon", () => {
    // Spiritual Weapon is a bonus-action spell attack that is NOT listed in the
    // SPELLS block's name lines on some sheets — the spells-exclusion guard
    // alone wouldn't catch it. Only the ACTIONS section may feed the roster.
    const txt = `═══════════════════════════════════════
  Test Cleric
  Hill Dwarf | Cleric 5 | Level 5
═══════════════════════════════════════

ACTIONS
• Warhammer       +6 to hit   1d8+3 bludgeoning

BONUS ACTIONS
• Spiritual Weapon +6 to hit   1d8+3 force

REACTIONS
• Opportunity Attack +6 to hit   1d8+3 bludgeoning`;
    const ev = parseToolResult("ddb_get_character", txt);
    expect(ev?.weapons).toEqual(["Warhammer"]);
  });
  describe("real captured DDB sheet (Bard 4)", () => {
    const ev = parseToolResult("ddb_get_character", REAL_BARD_SHEET);
    it("parses weapon names, including one containing a comma", () => {
      expect(ev?.weapons).toEqual([
        "Dragon Slayer Rapier",
        "Dagger",
        "Crossbow, Light",
      ]);
    });
    it("parses 'From Racial Trait:' spells and ignores the ⚠ warning + '• …' bullet", () => {
      expect(ev?.spells).toEqual([
        "Thaumaturgy",
        "Poison Spray",
        "Ray of Sickness",
      ]);
    });
  });

  describe("real captured DDB sheet (Warlock 9)", () => {
    const ev = parseToolResult("ddb_get_character", REAL_WARLOCK_SHEET);
    it("parses a weapon name carrying both a comma and a '+1' bonus", () => {
      // Eldritch Blast is absent from ACTIONS (attack cantrips stay out of it),
      // and the "(spell, …)" bonus/reaction bullets are excluded (no 'to hit').
      expect(ev?.weapons).toEqual(["Shortsword, +1", "Dagger"]);
    });
  });

  describe("corpus edge cases", () => {
    it("yields no weapons when ACTIONS is '(none)' but still parses spells", () => {
      const ev = parseToolResult("ddb_get_character", SHEET_NO_ACTIONS);
      expect(ev?.weapons).toBeUndefined();
      expect(ev?.spells).toEqual(["Fire Bolt", "Ray of Frost", "Burning Hands", "Minor Illusion"]);
    });
    it("keeps a spell-conjured 'weapon' as a spell without dropping the real weapon", () => {
      const ev = parseToolResult("ddb_get_character", SHEET_SPELL_WEAPON);
      expect(ev?.weapons).toEqual(["Mace"]);
      expect(ev?.spells).toContain("Spiritual Weapon");
    });
  });

  describe("real captured DDB sheet (Wizard 2)", () => {
    const ev = parseToolResult("ddb_get_character", REAL_WIZARD_SHEET);
    it("parses weapons only from ACTIONS (attack cantrips stay in SPELLS)", () => {
      expect(ev?.weapons).toEqual(["Dagger", "Quarterstaff"]);
    });
    it("parses Cantrips/Spells/From-source lines with (L#) + [ritual] stripped", () => {
      expect(ev?.spells).toEqual([
        "Mage Hand",
        "Light",
        "Message",
        "Comprehend Languages",
        "Detect Magic",
        "Magic Missile",
        "Shield",
        "Tenser's Floating Disk",
        "Chromatic Orb",
        "Grease",
        "Thaumaturgy",
        "Fire Bolt",
        "Dancing Lights",
        "Mending",
        "Tasha's Hideous Laughter",
      ]);
    });
  });
  it("does not slurp a 'From <source>:' trait line outside the SPELLS block", () => {
    const txt = `═══════════════════════════════════════
  Test Caster
  High Elf | Wizard 6 | Level 6
═══════════════════════════════════════

TRAITS
  From Race: Darkvision, Fey Ancestry

SPELLS
  Cantrips: Fire Bolt`;
    const ev = parseToolResult("ddb_get_character", txt);
    expect(ev?.spells).toEqual(["Fire Bolt"]);
  });
});

describe("parseToolResult — spell", () => {
  const ev = parseToolResult("ddb_get_spell", SPELL_TXT);
  it("classifies as a spell card titled by name only", () => {
    expect(ev?.kind).toBe("spell");
    expect(ev?.title).toBe("Fireball");
  });
  it("keeps the full markdown as the fallback", () => {
    expect(ev?.markdown).toBe(SPELL_TXT);
  });
});

describe("parseToolResult — suppressed cards", () => {
  it("returns null for ddb_list_characters (raw JSON dump)", () => {
    expect(parseToolResult("ddb_list_characters", '[{"id":"1","name":"X"}]')).toBeNull();
  });
});

describe("parseToolResult — generic + degradation", () => {
  it("treats ddb_character_lookup as generic (it's a feature-description lookup)", () => {
    const ev = parseToolResult("ddb_character_lookup", "# Cutting Words\nBardic inspiration...")!;
    expect(ev.kind).toBe("generic");
    expect(ev.title).toBe("Cutting Words");
  });
  it("titles a generic result with no heading by a humanized tool name", () => {
    const ev = parseToolResult("ddb_get_rules", "Some rules text with no heading.")!;
    expect(ev.kind).toBe("generic");
    expect(ev.title).toBe("Get rules");
    expect(ev.markdown).toBe("Some rules text with no heading.");
  });
  it("does not mistake a later full-line italic (e.g. a trait) for the type subtitle", () => {
    // No italic subtitle under the title, but a full-line italic appears later.
    const md = `# Specter\n\n**Armor Class** 12\n**Hit Points** 22 (5d8)\n\n## Traits\n\n*Incorporeal Movement*\nThe specter can move through creatures and objects.`;
    const ev = parseToolResult("ddb_get_monster", md)!;
    expect(ev.title).toBe("Specter");
    expect(ev.fields?.type).toBeUndefined();
    expect(ev.fields).toMatchObject({ ac: "12", hp: "22 (5d8)" });
  });
  it("degrades gracefully when a monster block is reformatted (no fields, markdown intact)", () => {
    const garbled = "Goblin — AC fifteen, HP seven";
    const ev = parseToolResult("ddb_get_monster", garbled)!;
    expect(ev.kind).toBe("monster");
    expect(ev.fields ?? {}).toEqual({});
    expect(ev.markdown).toBe(garbled);
    expect(ev.title).toBe("Goblin — AC fifteen, HP seven"); // no heading → falls back to the text's first line
  });
});

describe("extractToolResultText", () => {
  it("returns a string content unchanged", () => {
    expect(extractToolResultText("hello")).toBe("hello");
  });
  it("joins text parts of an array content", () => {
    expect(
      extractToolResultText([
        { type: "text", text: "a" },
        { type: "image", source: {} },
        { type: "text", text: "b" },
      ]),
    ).toBe("a\nb");
  });
  it("returns empty string for missing/odd content", () => {
    expect(extractToolResultText(undefined)).toBe("");
    expect(extractToolResultText(42)).toBe("");
  });
});
