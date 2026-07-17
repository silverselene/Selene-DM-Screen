import { describe, it, expect } from "vitest";
import {
  parseLeadingInt,
  parseHp,
  cardHasParseableHp,
  monsterCardToCombatant,
  characterCardToCombatant,
  characterCardToPlayerDraft,
  cardSpellWeaponLists,
  draftToPlayerInput,
  mergeNameLists,
  diffPlayer,
} from "./cardHandoff";
import type { ToolResultCard } from "./cardHandoff";
import type { PlayerCharacter } from "@/types";

function monsterCard(
  fields: Record<string, string>,
  title = "Goblin",
): ToolResultCard {
  return { type: "tool_result", tool: "ddb_get_monster", kind: "monster", title, fields, markdown: "" };
}
function characterCard(
  fields: Record<string, string>,
  title = "Gandalf",
): ToolResultCard {
  return { type: "tool_result", tool: "ddb_get_character", kind: "character", title, fields, markdown: "" };
}

describe("parseLeadingInt", () => {
  it("pulls the leading integer out of ddb field strings", () => {
    expect(parseLeadingInt("15 (natural armor)")).toBe(15);
    expect(parseLeadingInt("27 (5d8+5)")).toBe(27);
    expect(parseLeadingInt("+2")).toBe(2);
    expect(parseLeadingInt("-1")).toBe(-1);
  });
  it("returns undefined when there is no number", () => {
    expect(parseLeadingInt("no digits")).toBeUndefined();
    expect(parseLeadingInt("")).toBeUndefined();
    expect(parseLeadingInt(undefined)).toBeUndefined();
  });
});

describe("parseHp", () => {
  it("splits a cur/max string", () => {
    expect(parseHp("18/24")).toEqual({ cur: 18, max: 24 });
  });
  it("treats a single value as both cur and max", () => {
    expect(parseHp("27 (5d8+5)")).toEqual({ cur: 27, max: 27 });
  });
  it("falls back to zeros when unparseable or absent", () => {
    expect(parseHp("abc")).toEqual({ cur: 0, max: 0 });
    expect(parseHp(undefined)).toEqual({ cur: 0, max: 0 });
  });
});

describe("cardHasParseableHp", () => {
  // parseHp maps unreadable HP to {0,0}, which renders as a downed combatant —
  // the add-to-initiative UI checks this first so a parse failure gets an
  // explicit "set HP manually" note instead of a silent 0/0.
  it("is true when the hp field carries a number parseHp can read", () => {
    expect(cardHasParseableHp(monsterCard({ hp: "7 (2d6)" }))).toBe(true);
    expect(cardHasParseableHp(characterCard({ hp: "18/24" }))).toBe(true);
  });
  it("is false for a missing, empty, or numberless hp field", () => {
    expect(cardHasParseableHp(monsterCard({}))).toBe(false);
    expect(cardHasParseableHp(monsterCard({ hp: "" }))).toBe(false);
    expect(cardHasParseableHp(monsterCard({ hp: "unknown" }))).toBe(false);
    // No fields object at all (summary-only sheet).
    expect(
      cardHasParseableHp({ type: "tool_result", tool: "t", kind: "monster", title: "X", markdown: "" }),
    ).toBe(false);
  });
  // A field that parses to a 0 max (a summary sheet showing "0", or "0 (unknown)")
  // still mints a 0/0 downed combatant, so it must get the manual-HP note — the
  // guard tracks parseHp's real result, not mere digit-presence.
  it("is false when the hp field parses to a 0 max even though it has a digit", () => {
    expect(cardHasParseableHp(monsterCard({ hp: "0" }))).toBe(false);
    expect(cardHasParseableHp(monsterCard({ hp: "0 (unknown)" }))).toBe(false);
    expect(cardHasParseableHp(characterCard({ hp: "0/0" }))).toBe(false);
  });
});

describe("monsterCardToCombatant", () => {
  it("maps fields to a non-player combatant at full HP with the injected d20", () => {
    const c = monsterCardToCombatant(
      monsterCard({ ac: "15 (natural armor)", hp: "27 (5d8+5)" }),
      12,
    );
    expect(c).toMatchObject({
      name: "Goblin",
      initiative: 12,
      hp: 27,
      maxHp: 27,
      ac: 15,
      isPlayer: false,
    });
    expect(c.id).toMatch(/^c-/);
  });
  it("tolerates absent fields", () => {
    const c = monsterCardToCombatant(monsterCard({}), 5);
    expect(c).toMatchObject({ hp: 0, maxHp: 0, ac: undefined, isPlayer: false });
  });
});

describe("characterCardToCombatant", () => {
  it("splits cur/max HP and adds the init bonus to the d20", () => {
    const c = characterCardToCombatant(
      characterCard({ hp: "18/24", ac: "16", initiative: "+2" }),
      10,
    );
    expect(c).toMatchObject({
      name: "Gandalf",
      initiative: 12,
      hp: 18,
      maxHp: 24,
      ac: 16,
      isPlayer: true,
    });
  });
  it("uses the bare d20 when no init bonus is present", () => {
    const c = characterCardToCombatant(characterCard({ hp: "10/10" }), 7);
    expect(c.initiative).toBe(7);
  });
});

describe("characterCardToPlayerDraft", () => {
  it("maps card fields, using max HP and defaulting level to 1", () => {
    const d = characterCardToPlayerDraft(
      characterCard({ race: "Human", class: "Wizard 5", level: "5", ac: "16", hp: "18/24" }),
    );
    expect(d).toEqual({ name: "Gandalf", race: "Human", class: "Wizard 5", level: 5, ac: 16, hp: 24 });
  });
  it("nulls absent fields and defaults level to 1", () => {
    const d = characterCardToPlayerDraft(characterCard({}));
    expect(d).toEqual({ name: "Gandalf", race: null, class: null, level: 1, ac: null, hp: null });
  });
});

describe("draftToPlayerInput", () => {
  it("adds empty spells/weapons and passes clean values through", () => {
    expect(
      draftToPlayerInput({ name: "G", race: "Human", class: "Wizard", level: 5, ac: 16, hp: 24 }),
    ).toEqual({ name: "G", race: "Human", class: "Wizard", level: 5, ac: 16, hp: 24, spells: [], weapons: [] });
  });
  it("clamps level to >= 1 and nulls negative/NaN ac & hp", () => {
    expect(
      draftToPlayerInput({ name: "G", race: null, class: null, level: 0, ac: -3, hp: NaN }),
    ).toMatchObject({ level: 1, ac: null, hp: null, spells: [], weapons: [] });
  });
  it("threads through the provided spell/weapon lists", () => {
    expect(
      draftToPlayerInput(
        { name: "G", race: "Elf", class: "Wizard", level: 6, ac: 12, hp: 32 },
        { spells: ["Fireball", "Shield"], weapons: ["Dagger"] },
      ),
    ).toMatchObject({ spells: ["Fireball", "Shield"], weapons: ["Dagger"] });
  });
});

describe("cardSpellWeaponLists", () => {
  const charCard = (extra: Partial<ToolResultCard>): ToolResultCard => ({
    type: "tool_result", tool: "ddb_get_character", kind: "character", title: "E", markdown: "", ...extra,
  });
  it("trims, drops empties, and de-dupes case-insensitively", () => {
    expect(
      cardSpellWeaponLists(charCard({ spells: [" Fireball ", "fireball", "", "Shield"], weapons: ["Dagger", "dagger "] })),
    ).toEqual({ spells: ["Fireball", "Shield"], weapons: ["Dagger"] });
  });
  it("yields empty arrays when the card carries no lists", () => {
    expect(cardSpellWeaponLists(charCard({}))).toEqual({ spells: [], weapons: [] });
  });
});

describe("mergeNameLists", () => {
  it("unions case-insensitively with base order first", () => {
    expect(mergeNameLists(["Fireball", "Shield"], ["shield", "Magic Missile"])).toEqual([
      "Fireball", "Shield", "Magic Missile",
    ]);
  });
});

describe("diffPlayer", () => {
  const existing: PlayerCharacter = {
    id: 1, name: "Gandalf", race: "Human", class: "Wizard", level: 4, ac: 15, hp: 22, spells: [], weapons: [],
  };
  it("returns only changed rows in field order", () => {
    const rows = diffPlayer(existing, {
      name: "Gandalf", race: "Human", class: "Wizard", level: 5, ac: 16, hp: 24,
    });
    expect(rows.map((r) => r.label)).toEqual(["Level", "AC", "HP"]);
    expect(rows[0]).toEqual({ field: "level", label: "Level", before: "4", after: "5" });
  });
  it("returns [] when the shared fields are identical", () => {
    expect(
      diffPlayer(existing, { name: "Gandalf", race: "Human", class: "Wizard", level: 4, ac: 15, hp: 22 }),
    ).toEqual([]);
  });
});
