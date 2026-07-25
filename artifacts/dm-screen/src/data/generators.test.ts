// Coverage for the wares shop generator — the one piece of `generators.ts`
// with actual logic (distinct sampling, a count range, a price roll) rather
// than a flat pick from a hand-written list. The other generators
// (generateName/generateLoot/generateItem/generatePlaceName) are exercised
// indirectly by the widget and don't need a dedicated suite: swap in a wrong
// string and the DM notices immediately, there's no invariant to break.
import { describe, it, expect, vi, afterEach } from "vitest";
import { generateWares, rollWarePrice, waresByShop, type WareEntry } from "./generators";

describe("waresByShop", () => {
  it("has the four requested shop types, each with enough stock for a 5-item roll", () => {
    expect(Object.keys(waresByShop)).toEqual(["Tavern", "Blacksmith", "Trader", "Alchemist"]);
    for (const [shop, items] of Object.entries(waresByShop)) {
      expect(items.length, `${shop} needs at least 5 entries`).toBeGreaterThanOrEqual(5);
    }
  });

  it("gives every entry a non-empty name and a valid min/max/unit", () => {
    for (const items of Object.values(waresByShop)) {
      for (const item of items) {
        expect(item.name.trim()).not.toBe("");
        expect(item.min).toBeGreaterThan(0);
        expect(item.max).toBeGreaterThanOrEqual(item.min);
        expect(["cp", "sp", "gp"]).toContain(item.unit);
      }
    }
  });
});

describe("rollWarePrice", () => {
  afterEach(() => vi.restoreAllMocks());

  it("formats a flat-price entry as 'amount unit'", () => {
    const entry: WareEntry = { name: "Torch", min: 1, max: 1, unit: "cp" };
    expect(rollWarePrice(entry)).toBe("1 cp");
  });

  it("rolls the low end of a range when Math.random returns 0", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const entry: WareEntry = { name: "Fine Wine", min: 10, max: 15, unit: "gp" };
    expect(rollWarePrice(entry)).toBe("10 gp");
  });

  it("rolls the high end of a range just under Math.random() = 1", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.999999);
    const entry: WareEntry = { name: "Fine Wine", min: 10, max: 15, unit: "gp" };
    expect(rollWarePrice(entry)).toBe("15 gp");
  });

  it("never rolls outside [min, max] across many draws", () => {
    const entry: WareEntry = { name: "Spices", min: 3, max: 6, unit: "gp" };
    for (let i = 0; i < 200; i++) {
      const amount = Number(rollWarePrice(entry).split(" ")[0]);
      expect(amount).toBeGreaterThanOrEqual(3);
      expect(amount).toBeLessThanOrEqual(6);
    }
  });
});

describe("generateWares", () => {
  it("rolls between 3 and 5 lines", () => {
    for (let i = 0; i < 50; i++) {
      const lines = generateWares("Tavern").split("\n");
      expect(lines.length).toBeGreaterThanOrEqual(3);
      expect(lines.length).toBeLessThanOrEqual(5);
    }
  });

  it("never repeats an item within one roll", () => {
    for (let i = 0; i < 50; i++) {
      const names = generateWares("Blacksmith")
        .split("\n")
        .map((line) => line.split(" — ")[0]);
      expect(new Set(names).size).toBe(names.length);
    }
  });

  it("formats every line as 'Name — amount unit'", () => {
    const lines = generateWares("Alchemist").split("\n");
    for (const line of lines) {
      expect(line).toMatch(/^.+ — \d+ (cp|sp|gp)$/);
    }
  });

  it("only draws from the requested shop's table", () => {
    const traderNames = new Set(waresByShop["Trader"].map((w) => w.name));
    for (let i = 0; i < 20; i++) {
      const names = generateWares("Trader")
        .split("\n")
        .map((line) => line.split(" — ")[0]);
      for (const name of names) expect(traderNames).toContain(name);
    }
  });

  it("falls back to Tavern for an unrecognized shop name", () => {
    // Matches the `namesByRace[race] || namesByRace["Human"]` fallback
    // pattern the other generators use for a stale/hand-edited selection.
    const tavernNames = new Set(waresByShop["Tavern"].map((w) => w.name));
    const names = generateWares("Not A Real Shop")
      .split("\n")
      .map((line) => line.split(" — ")[0]);
    for (const name of names) expect(tavernNames).toContain(name);
  });
});
