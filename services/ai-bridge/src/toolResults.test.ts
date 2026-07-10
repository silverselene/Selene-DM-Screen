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

describe("parseToolResult — monster", () => {
  const ev = parseToolResult("ddb_get_monster", MONSTER_MD);
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
  const ev = parseToolResult("ddb_get_character", CHARACTER_TXT);
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

describe("parseToolResult — generic + degradation", () => {
  it("treats ddb_character_lookup as generic (it's a feature-description lookup)", () => {
    const ev = parseToolResult("ddb_character_lookup", "# Cutting Words\nBardic inspiration...");
    expect(ev.kind).toBe("generic");
    expect(ev.title).toBe("Cutting Words");
  });
  it("titles a generic result with no heading by a humanized tool name", () => {
    const ev = parseToolResult("ddb_get_rules", "Some rules text with no heading.");
    expect(ev.kind).toBe("generic");
    expect(ev.title).toBe("Get rules");
    expect(ev.markdown).toBe("Some rules text with no heading.");
  });
  it("does not mistake a later full-line italic (e.g. a trait) for the type subtitle", () => {
    // No italic subtitle under the title, but a full-line italic appears later.
    const md = `# Specter\n\n**Armor Class** 12\n**Hit Points** 22 (5d8)\n\n## Traits\n\n*Incorporeal Movement*\nThe specter can move through creatures and objects.`;
    const ev = parseToolResult("ddb_get_monster", md);
    expect(ev.title).toBe("Specter");
    expect(ev.fields?.type).toBeUndefined();
    expect(ev.fields).toMatchObject({ ac: "12", hp: "22 (5d8)" });
  });
  it("degrades gracefully when a monster block is reformatted (no fields, markdown intact)", () => {
    const garbled = "Goblin — AC fifteen, HP seven";
    const ev = parseToolResult("ddb_get_monster", garbled);
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
