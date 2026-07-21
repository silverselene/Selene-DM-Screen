import { describe, it, expect, vi } from "vitest";

// The real dataset is 4.7 MB and (today) emitted pre-sorted by name — which
// is exactly what masks the empty-query "slice before sort" bug. Mock it
// down to a handful of entries in DELIBERATELY non-alphabetical order, with
// more rich entries than the search limit, so the bug is observable: taking
// the first N in dataset order and only then sorting returns an arbitrary
// subset presented as alphabetical.
vi.mock("@/data/monsters", () => {
  const rich = (name: string) => ({
    name,
    size: "Medium",
    type: "humanoid",
    ac: 12,
    acType: "natural armor",
    hp: "10",
    cr: "1",
    source: "MM",
    isLegendary: false,
    initiativeModifier: 0,
    // A defined `actions` field is what marks an entry as a full stat block.
    actions: [],
  });
  const thin = (name: string) => {
    const { actions, ...rest } = rich(name);
    void actions;
    return rest;
  };
  return {
    monsters: [
      // Out of alphabetical order on purpose.
      rich("Zombie"),
      rich("Goblin"),
      rich("Aboleth"),
      rich("Owlbear"),
      rich("Beholder"),
      thin("Kobold Warren"), // thin: excluded from the empty-query browse
    ],
  };
});

import { searchMonsters, findRichMonster } from "./monsterSearch";

describe("searchMonsters — empty query browse", () => {
  it("returns the first {limit} rich monsters in ALPHABETICAL order", () => {
    // limit below the rich count forces the slice to matter: a correct impl
    // sorts first, so the alphabetically-first names win regardless of
    // dataset order. The buggy slice-then-sort would yield {Zombie, Goblin,
    // Aboleth} sorted → Aboleth, Goblin, Zombie, missing Beholder.
    const names = searchMonsters("", 3).map((h) => h.name);
    expect(names).toEqual(["Aboleth", "Beholder", "Goblin"]);
  });

  it("excludes thin (no-stat-block) entries from the browse", () => {
    const names = searchMonsters("").map((h) => h.name);
    expect(names).not.toContain("Kobold Warren");
  });
});

describe("searchMonsters — query ranking", () => {
  it("ranks prefix matches above substring matches", () => {
    // "o" is a prefix of Owlbear and a substring of Goblin/Aboleth/Zombie.
    const names = searchMonsters("o").map((h) => h.name);
    expect(names[0]).toBe("Owlbear");
  });

  it("breaks equal-score ties alphabetically, rich before thin", () => {
    // "l" is a substring of every fixture except Zombie, and a prefix of
    // none — so all matches share score 1 and order is decided by the
    // rich-before-thin then alphabetical tiebreak.
    const names = searchMonsters("l").map((h) => h.name);
    expect(names).toEqual([
      "Aboleth",
      "Beholder",
      "Goblin",
      "Owlbear",
      "Kobold Warren", // thin — sorts after every rich match
    ]);
  });

  it("returns nothing for a non-matching query", () => {
    expect(searchMonsters("xyzzy")).toEqual([]);
  });
});

describe("findRichMonster", () => {
  it("finds a rich entry case-insensitively", () => {
    expect(findRichMonster("aBOleth")?.name).toBe("Aboleth");
  });

  it("returns null for a thin-only entry", () => {
    expect(findRichMonster("Kobold Warren")).toBeNull();
  });

  it("returns null for an unknown name", () => {
    expect(findRichMonster("Tarrasque")).toBeNull();
  });
});
