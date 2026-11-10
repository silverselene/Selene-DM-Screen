import { describe, it, expect, vi } from "vitest";

import {
  DdbFetchError,
  ddbCharacterJsonUrl,
  ddbCharacterToPlayer,
  fetchDdbCharacter,
  parseDdbCharacterId,
  parseDdbCharacterJson,
  MAX_DDB_JSON_CHARS,
} from "./ddbImport";

// Minimal documents in the D&D Beyond character-service v5 shape. Only the
// fields the importer reads are present; everything else on a real sheet is
// ignored.
const stats = (str: number, dex: number, con: number, int: number, wis: number, cha: number) =>
  [str, dex, con, int, wis, cha].map((value, i) => ({ id: i + 1, name: null, value }));
const nullStats = () => [1, 2, 3, 4, 5, 6].map((id) => ({ id, name: null, value: null }));

function sheet(overrides: Record<string, unknown> = {}) {
  return {
    id: 12345678,
    name: "Selene",
    race: { fullName: "High Elf", baseName: "Elf" },
    classes: [{ level: 5, isStartingClass: true, definition: { name: "Wizard" } }],
    stats: stats(8, 14, 14, 16, 12, 10),
    bonusStats: nullStats(),
    overrideStats: nullStats(),
    baseHitPoints: 27,
    bonusHitPoints: null,
    overrideHitPoints: null,
    modifiers: { race: [], class: [], background: [], feat: [], item: [], condition: [] },
    inventory: [],
    classSpells: [],
    spells: { race: [], class: [], feat: [], item: [], background: null },
    characterValues: [],
    ...overrides,
  };
}

const wrap = (data: unknown) => ({ id: 1, success: true, message: "Character successfully received.", data });

const weapon = (id: number, name: string, equipped = true) => ({
  id: id * 10,
  equipped,
  isAttuned: false,
  definition: { id, name, filterType: "Weapon", canAttune: false },
});

const armor = (id: number, name: string, ac: number, armorTypeId: number, extra: Record<string, unknown> = {}) => ({
  id: id * 10,
  equipped: true,
  isAttuned: false,
  definition: { id, name, filterType: "Armor", armorClass: ac, armorTypeId, canAttune: false },
  ...extra,
});

const spell = (name: string, level: number, flags: Record<string, unknown> = {}) => ({
  prepared: false,
  alwaysPrepared: false,
  definition: { name, level },
  ...flags,
});

describe("parseDdbCharacterId", () => {
  it.each([
    ["12345678", "12345678"],
    ["  12345678 ", "12345678"],
    ["https://www.dndbeyond.com/characters/12345678", "12345678"],
    ["https://www.dndbeyond.com/characters/12345678/AbCdEf", "12345678"],
    ["dndbeyond.com/profile/someuser/characters/12345678", "12345678"],
    ["https://www.dndbeyond.com/characters/12345678?tab=spells", "12345678"],
    ["https://character-service.dndbeyond.com/character/v5/character/12345678", "12345678"],
  ])("extracts the id from %s", (input, id) => {
    expect(parseDdbCharacterId(input)).toBe(id);
  });

  it.each(["", "Selene", "https://example.com/characters/123", "https://www.dndbeyond.com/monsters/123"])(
    "rejects %s",
    (input) => {
      expect(parseDdbCharacterId(input)).toBeNull();
    },
  );

  it("builds the character-service URL", () => {
    expect(ddbCharacterJsonUrl("42")).toBe(
      "https://character-service.dndbeyond.com/character/v5/character/42",
    );
  });
});

describe("ddbCharacterToPlayer — identity fields", () => {
  it("reads the six ability scores, including bonuses", () => {
    const { character } = ddbCharacterToPlayer(
      sheet({
        modifiers: { race: [{ type: "bonus", subType: "intelligence-score", value: 2 }] },
      }),
    );
    expect(character.abilities).toEqual({ str: 8, dex: 14, con: 14, int: 18, wis: 12, cha: 10 });
  });

  it("reads name / race / class / level from the v5 envelope", () => {
    const { character, ddbId } = ddbCharacterToPlayer(wrap(sheet()));
    expect(character).toMatchObject({ name: "Selene", race: "High Elf", class: "Wizard", level: 5 });
    expect(ddbId).toBe(12345678);
  });

  it("accepts a bare (un-enveloped) sheet", () => {
    expect(ddbCharacterToPlayer(sheet()).character.name).toBe("Selene");
  });

  it("formats a multiclass with levels, starting class first, and sums the level", () => {
    const { character } = ddbCharacterToPlayer(
      sheet({
        classes: [
          { level: 2, isStartingClass: false, definition: { name: "Wizard" } },
          { level: 3, isStartingClass: true, definition: { name: "Fighter" } },
        ],
      }),
    );
    expect(character.class).toBe("Fighter 3 / Wizard 2");
    expect(character.level).toBe(5);
  });

  it("throws a privacy hint when the service reports failure", () => {
    expect(() => ddbCharacterToPlayer({ success: false, message: "Unauthorized", data: null })).toThrow(/Public/);
  });

  it("throws on documents that aren't characters", () => {
    expect(() => ddbCharacterToPlayer({ schema: "selene-dm-party", party: [] })).toThrow(/D&D Beyond/);
    expect(() => ddbCharacterToPlayer([1, 2])).toThrow(/D&D Beyond/);
  });
});

describe("ddbCharacterToPlayer — max HP", () => {
  it("adds CON mod per level to base + bonus HP", () => {
    // 27 base + 2 bonus + (+2 CON × 5)
    expect(ddbCharacterToPlayer(sheet({ bonusHitPoints: 2 })).character.hp).toBe(39);
  });

  it("counts racial / feat CON bonuses and per-level HP bonuses (Tough)", () => {
    const { character } = ddbCharacterToPlayer(
      sheet({
        modifiers: {
          race: [{ type: "bonus", subType: "constitution-score", value: 2 }], // 14 → 16
          class: [],
          background: [],
          feat: [{ type: "bonus", subType: "hit-points-per-level", value: 2 }],
          item: [],
        },
      }),
    );
    // 27 + 3×5 + 2×5
    expect(character.hp).toBe(52);
  });

  it("only counts item CON modifiers from equipped + attuned items", () => {
    const amulet = (attuned: boolean) => ({
      id: 900,
      equipped: true,
      isAttuned: attuned,
      definition: { id: 77, name: "Amulet of Health", filterType: "Wondrous item", canAttune: true },
    });
    const mods = {
      race: [], class: [], background: [], feat: [],
      item: [{ type: "set", subType: "constitution-score", value: 19, componentId: 77 }],
    };
    expect(ddbCharacterToPlayer(sheet({ modifiers: mods, inventory: [amulet(false)] })).character.hp).toBe(37);
    // CON 19 → +4: 27 + 20
    expect(ddbCharacterToPlayer(sheet({ modifiers: mods, inventory: [amulet(true)] })).character.hp).toBe(47);
  });

  it("honours the sheet's HP override", () => {
    expect(ddbCharacterToPlayer(sheet({ overrideHitPoints: 99 })).character.hp).toBe(99);
  });

  it("returns null + a warning when no HP data is present", () => {
    const r = ddbCharacterToPlayer(sheet({ baseHitPoints: undefined }));
    expect(r.character.hp).toBeNull();
    expect(r.warnings.join(" ")).toMatch(/HP/);
  });
});

describe("ddbCharacterToPlayer — armor class", () => {
  it("is 10 + DEX unarmored", () => {
    expect(ddbCharacterToPlayer(sheet()).character.ac).toBe(12);
  });

  it("caps DEX for medium armor and ignores it for heavy", () => {
    const dex18 = stats(10, 18, 14, 10, 10, 10);
    expect(
      ddbCharacterToPlayer(sheet({ stats: dex18, inventory: [armor(1, "Half Plate Armor", 15, 2)] })).character.ac,
    ).toBe(17);
    expect(
      ddbCharacterToPlayer(sheet({ stats: dex18, inventory: [armor(2, "Plate Armor", 18, 3)] })).character.ac,
    ).toBe(18);
    expect(
      ddbCharacterToPlayer(sheet({ stats: dex18, inventory: [armor(3, "Studded Leather Armor", 12, 1)] })).character.ac,
    ).toBe(16);
  });

  it("ignores unequipped armor and adds an equipped shield", () => {
    const inventory = [
      { ...armor(2, "Plate Armor", 18, 3), equipped: false },
      armor(4, "Shield", 2, 4),
    ];
    // 10 + 2 DEX + 2 shield
    expect(ddbCharacterToPlayer(sheet({ inventory })).character.ac).toBe(14);
  });

  it("applies Unarmored Defense (statId) and the Defense fighting style only when armored", () => {
    const barbarian = sheet({
      stats: stats(16, 14, 16, 8, 10, 10),
      modifiers: {
        race: [], background: [], feat: [], item: [],
        class: [
          { type: "set", subType: "unarmored-armor-class", statId: 3, value: null },
          { type: "bonus", subType: "armored-armor-class", value: 1 },
        ],
      },
    });
    // 10 + 2 DEX + 3 CON; the armored bonus doesn't apply
    expect(ddbCharacterToPlayer(barbarian).character.ac).toBe(15);
    // Chain mail 16, no DEX, +1 Defense
    expect(
      ddbCharacterToPlayer({ ...barbarian, inventory: [armor(5, "Chain Mail", 16, 3)] }).character.ac,
    ).toBe(17);
  });

  it("adds item AC bonuses (Ring of Protection) and the sheet's manual AC bonuses", () => {
    const ring = {
      id: 600,
      equipped: true,
      isAttuned: true,
      definition: { id: 60, name: "Ring of Protection", filterType: "Ring", canAttune: true },
    };
    const r = ddbCharacterToPlayer(
      sheet({
        inventory: [ring],
        modifiers: {
          race: [], class: [], background: [], feat: [],
          item: [{ type: "bonus", subType: "armor-class", value: 1, componentId: 60 }],
        },
        characterValues: [{ typeId: 3, value: 1, valueId: null }],
      }),
    );
    expect(r.character.ac).toBe(14);
  });

  it("honours the sheet's AC override", () => {
    expect(
      ddbCharacterToPlayer(sheet({ characterValues: [{ typeId: 1, value: 21 }] })).character.ac,
    ).toBe(21);
  });

  it("respects overridden ability scores", () => {
    const overrideStats = nullStats().map((s) => (s.id === 2 ? { ...s, value: 20 } : s));
    expect(ddbCharacterToPlayer(sheet({ overrideStats })).character.ac).toBe(15);
  });
});

describe("ddbCharacterToPlayer — weapons", () => {
  it("lists equipped weapons, deduplicated", () => {
    const { character } = ddbCharacterToPlayer(
      sheet({
        inventory: [
          weapon(1, "Dagger"),
          weapon(1, "Dagger"),
          weapon(2, "Longbow", false),
          weapon(3, "Quarterstaff"),
          armor(4, "Shield", 2, 4),
        ],
      }),
    );
    expect(character.weapons).toEqual(["Dagger", "Quarterstaff"]);
  });

  it("falls back to every carried weapon when none are equipped", () => {
    const { character } = ddbCharacterToPlayer(
      sheet({ inventory: [weapon(1, "Dagger", false), weapon(2, "Longbow", false)] }),
    );
    expect(character.weapons).toEqual(["Dagger", "Longbow"]);
  });
});

describe("ddbCharacterToPlayer — spells", () => {
  it("keeps a preparing caster's whole spellbook, marking only prepared spells + cantrips prepared", () => {
    const { character } = ddbCharacterToPlayer(
      sheet({
        classSpells: [
          {
            characterClassId: 1,
            spells: [
              spell("Shield", 1, { prepared: true }),
              spell("Fire Bolt", 0),
              spell("Feather Fall", 1), // in the spellbook, not prepared
              spell("Magic Missile", 1, { alwaysPrepared: true }),
            ],
          },
        ],
      }),
    );
    expect(character.spells).toEqual(["Fire Bolt", "Feather Fall", "Magic Missile", "Shield"]);
    expect(character.prepared).toEqual(["Fire Bolt", "Magic Missile", "Shield"]);
  });

  it("keeps every spell for a known-spells caster and adds racial / feat spells", () => {
    const { character } = ddbCharacterToPlayer(
      sheet({
        classSpells: [
          { characterClassId: 2, spells: [spell("Thunderwave", 1), spell("Vicious Mockery", 0)] },
        ],
        spells: {
          race: [{ definition: { name: "Dancing Lights", level: 0 } }],
          feat: [{ definition: { name: "Misty Step", level: 2 } }, { definition: { name: "Thunderwave", level: 1 } }],
          item: [{ definition: { name: "Fireball", level: 3 } }],
          class: null,
        },
      }),
    );
    expect(character.spells).toEqual(["Dancing Lights", "Vicious Mockery", "Thunderwave", "Misty Step"]);
    expect(character.prepared).toEqual(character.spells);
  });

  it("marks a spell prepared if any source prepares it, without listing it twice", () => {
    const { character } = ddbCharacterToPlayer(
      sheet({
        classSpells: [{ spells: [spell("Shield", 1, { prepared: true }), spell("Misty Step", 2)] }],
        spells: { feat: [{ definition: { name: "Misty Step", level: 2 } }] },
      }),
    );
    expect(character.spells).toEqual(["Shield", "Misty Step"]);
    expect(character.prepared).toEqual(["Shield", "Misty Step"]);
  });

  it("caps the spell list and warns", () => {
    // 120 spellbook spells, only the last 5 prepared: the cap must keep those 5.
    const many = Array.from({ length: 120 }, (_, i) =>
      spell(`Spell ${String(i).padStart(3, "0")}`, 1, { prepared: i >= 115 }),
    );
    const r = ddbCharacterToPlayer(sheet({ classSpells: [{ spells: many }] }));
    expect(r.character.spells).toHaveLength(100);
    expect(r.character.prepared).toEqual(["Spell 115", "Spell 116", "Spell 117", "Spell 118", "Spell 119"]);
    expect(r.warnings.join(" ")).toMatch(/100 of 120 spells/);
  });
});

describe("parseDdbCharacterJson", () => {
  it("parses pasted JSON text", () => {
    expect(parseDdbCharacterJson(JSON.stringify(wrap(sheet()))).character.name).toBe("Selene");
  });

  it("rejects empty, invalid, and oversized input with readable errors", () => {
    expect(() => parseDdbCharacterJson("   ")).toThrow(/Paste/);
    expect(() => parseDdbCharacterJson("<html>nope</html>")).toThrow(/valid JSON/);
    expect(() => parseDdbCharacterJson("x".repeat(MAX_DDB_JSON_CHARS + 1))).toThrow(/too large/);
  });
});

describe("fetchDdbCharacter", () => {
  const ok = (body: unknown, status = 200) =>
    vi.fn(async () => new Response(JSON.stringify(body), { status }));

  it("fetches the character-service URL without credentials", async () => {
    const fetchImpl = ok(wrap(sheet()));
    const r = await fetchDdbCharacter("12345678", { fetchImpl });
    expect(r.character.name).toBe("Selene");
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://character-service.dndbeyond.com/character/v5/character/12345678",
      expect.objectContaining({ credentials: "omit" }),
    );
  });

  it("maps a network/CORS failure to a DdbFetchError('network')", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    await expect(fetchDdbCharacter("1", { fetchImpl })).rejects.toMatchObject({
      name: "DdbFetchError",
      kind: "network",
    });
  });

  it("maps 403/404 to a privacy hint", async () => {
    const err = await fetchDdbCharacter("1", { fetchImpl: ok({}, 403) }).catch((e) => e);
    expect(err).toBeInstanceOf(DdbFetchError);
    expect(err.kind).toBe("private");
  });

  it("re-throws aborts untouched", async () => {
    const abort = new DOMException("aborted", "AbortError");
    const fetchImpl = vi.fn(async () => {
      throw abort;
    });
    await expect(fetchDdbCharacter("1", { fetchImpl })).rejects.toBe(abort);
  });
});
