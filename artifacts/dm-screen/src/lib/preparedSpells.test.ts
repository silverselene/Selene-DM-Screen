import { afterEach, describe, expect, it, vi } from "vitest";

import { isPrepared, preparedAfterAdding, splitSpells, togglePrepared } from "./preparedSpells";
import { addCharacter, exportPartyAsJson, loadParty, preparePartyImport } from "./partyStore";

// Claude Skamos (Tiefling Wizard 2) — spell names from the real D&D Beyond
// sheet in services/ai-bridge/src/toolResults.test.ts. Cantrips + Chromatic
// Orb prepared; the rest of the spellbook known only.
const CANTRIPS = ["Mage Hand", "Light", "Message", "Thaumaturgy", "Fire Bolt", "Dancing Lights", "Mending"];
const SPELLBOOK = ["Comprehend Languages", "Detect Magic", "Magic Missile", "Shield", "Chromatic Orb", "Grease"];
const claude = { spells: [...CANTRIPS, ...SPELLBOOK], prepared: [...CANTRIPS, "Chromatic Orb"] };

describe("prepared vs known spells", () => {
  it("splits a Wizard's spells into prepared and spellbook-only, keeping order", () => {
    const { prepared, known } = splitSpells(claude);
    expect(prepared).toEqual([...CANTRIPS, "Chromatic Orb"]);
    expect(known).toEqual(["Comprehend Languages", "Detect Magic", "Magic Missile", "Shield", "Grease"]);
    expect(isPrepared(claude, "fire bolt")).toBe(true);
    expect(isPrepared(claude, "Magic Missile")).toBe(false);
  });

  it("treats a character with no explicit choice as having everything prepared", () => {
    const legacy = { spells: ["Fireball", "Shield"], prepared: null };
    expect(splitSpells(legacy)).toEqual({ prepared: ["Fireball", "Shield"], known: [] });
    expect(splitSpells({ spells: ["Fireball"] })).toEqual({ prepared: ["Fireball"], known: [] });
  });

  it("toggles one spell, making an implicit 'all prepared' list explicit", () => {
    expect(togglePrepared({ spells: ["A", "B"], prepared: null }, "B")).toEqual(["A"]);
    expect(togglePrepared(claude, "Shield")).toEqual([...CANTRIPS, "Chromatic Orb", "Shield"]);
    expect(togglePrepared(claude, "Chromatic Orb")).toEqual(CANTRIPS);
  });

  it("prepares a newly added spell unless the list is still implicit", () => {
    expect(preparedAfterAdding({ spells: ["A"], prepared: null }, "B")).toBeNull();
    expect(preparedAfterAdding({ spells: ["A"], prepared: [] }, "B")).toEqual(["B"]);
  });
});

describe("partyStore keeps `prepared` consistent", () => {
  afterEach(() => vi.unstubAllGlobals());
  const install = () => {
    const m = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (k: string) => m.get(k) ?? null,
        setItem: (k: string, v: string) => void m.set(k, v),
        removeItem: (k: string) => void m.delete(k),
      },
      dispatchEvent: () => true,
    });
    return m;
  };
  const pc = { name: "Claude Skamos", race: null, class: "Wizard", level: 2, ac: 10, hp: 10, weapons: [] };

  it("reads a record written before the field existed as 'all prepared'", () => {
    const m = install();
    m.set("dm-party-v1", JSON.stringify([{ ...pc, id: 7, spells: ["Fire Bolt"] }]));
    expect(loadParty()[0].prepared).toBeNull();
  });

  it("clamps `prepared` to the character's spells, in the spells' spelling", () => {
    install();
    addCharacter({ ...pc, spells: ["Fire Bolt", "Shield"], prepared: ["fire bolt", "Fireball"] });
    expect(loadParty()[0].prepared).toEqual(["Fire Bolt"]);
  });

  it("keeps ability scores, clamped to 1–30, and reads a record without them as null", () => {
    install();
    addCharacter({ ...pc, spells: [], abilities: { str: 8, dex: 99, con: null, int: 16, wis: 0, cha: 10 } });
    expect(loadParty()[0].abilities).toEqual({ str: 8, dex: 30, con: null, int: 16, wis: 1, cha: 10 });
    install().set("dm-party-v1", JSON.stringify([{ ...pc, id: 3, spells: [] }]));
    expect(loadParty()[0].abilities).toBeNull();
  });

  it("keeps a D&D Beyond link but drops anything else (it's rendered as a link)", () => {
    install();
    addCharacter({ ...pc, spells: [], ddbUrl: "https://www.dndbeyond.com/characters/1" });
    addCharacter({ ...pc, name: "Mallory", spells: [], ddbUrl: "javascript:alert(1)" });
    const [a, b] = loadParty();
    expect(a.ddbUrl).toBe("https://www.dndbeyond.com/characters/1");
    expect(b.ddbUrl).toBeNull();
  });

  it("keeps only real skills with a valid level", () => {
    install();
    addCharacter({
      ...pc, spells: [],
      skills: { arcana: "proficient", history: "expertise", flying: "proficient", stealth: "master" } as never,
    });
    expect(loadParty()[0].skills).toEqual({ arcana: "proficient", history: "expertise" });
  });

  it("round-trips through the party export / import", () => {
    install();
    addCharacter({ ...pc, ...claude });
    const { commit } = preparePartyImport(exportPartyAsJson());
    commit();
    expect(splitSpells(loadParty()[0]).known).toEqual(["Comprehend Languages", "Detect Magic", "Magic Missile", "Shield", "Grease"]);
  });
});
