import { describe, it, expect } from "vitest";
import { normalizeQuery, parseLookupCommand, toSpellCard, toMonsterCard, toRuleCard, lookupDataset, autoDetectLocal, resolveBundledSpell } from "./localLookup";
import { monsterCardToCombatant } from "./cardHandoff";
import type { Spell } from "@/data/spells";
import type { MonsterEntry } from "@/data/monsters";
import type { CompendiumEntry } from "@/data/compendium";

describe("normalizeQuery", () => {
  it("lowercases, trims, collapses whitespace, drops a trailing ?", () => {
    expect(normalizeQuery("  Fire   Bolt ?")).toBe("fire bolt");
  });
  it("strips a leading filler phrase", () => {
    expect(normalizeQuery("What is Fireball")).toBe("fireball");
    expect(normalizeQuery("tell me about the Grappled")).toBe("grappled");
    expect(normalizeQuery("what does Fireball do")).toBe("fireball do");
  });
  it("strips a single leading 'the'", () => {
    expect(normalizeQuery("the goblin")).toBe("goblin");
  });
  it("leaves a bare name untouched", () => {
    expect(normalizeQuery("Goblin")).toBe("goblin");
  });
});

describe("parseLookupCommand", () => {
  it("parses each command + arg", () => {
    expect(parseLookupCommand("/spell fireball")).toEqual({ dataset: "spell", arg: "fireball" });
    expect(parseLookupCommand("/monster  Goblin ")).toEqual({ dataset: "monster", arg: "Goblin" });
    expect(parseLookupCommand("/rule grappled")).toEqual({ dataset: "rule", arg: "grappled" });
  });
  it("is case-insensitive on the command word", () => {
    expect(parseLookupCommand("/Spell Fireball")).toEqual({ dataset: "spell", arg: "Fireball" });
  });
  it("returns a null-arg-safe empty string for a bare command", () => {
    expect(parseLookupCommand("/spell")).toEqual({ dataset: "spell", arg: "" });
  });
  it("returns null for non-commands", () => {
    expect(parseLookupCommand("fireball")).toBeNull();
    expect(parseLookupCommand("/clear")).toBeNull();
    expect(parseLookupCommand("/unknown x")).toBeNull();
  });
});

const spell: Spell = {
  name: "Fireball", level: 3, school: "Evocation", castingTime: "1 action",
  range: "150 feet", components: "V, S, M", duration: "Instantaneous",
  classes: ["Sorcerer", "Wizard"], description: "A bright streak flashes...",
  damageSummary: "8d6 Fire (Dex save)",
};

const goblin: MonsterEntry = {
  name: "Goblin", ac: 15, acType: "leather armor, shield", hp: "7 (2d6)",
  cr: "1/4", size: "Small", type: "humanoid (goblinoid)", alignment: "neutral evil",
  source: "MM", environment: "forest", pageNumber: 166, isLegendary: false,
  initiativeModifier: 2, initiativeRoll: 12, speed: "30 ft.",
};

const rule: CompendiumEntry = {
  id: "condition-grappled", title: "Grappled", category: "Conditions",
  content: "A grappled creature's speed becomes 0...", tags: ["condition"],
};

describe("card builders", () => {
  it("builds a spell card (re-rendered via SpellCardBody) with a markdown fallback", () => {
    const c = toSpellCard(spell);
    expect(c.kind).toBe("spell");
    expect(c.title).toBe("Fireball");
    expect(c.markdown).toContain("Level 3");
    expect(c.markdown).toContain("Evocation");
    expect(c.markdown).toContain("A bright streak");
    expect(c.fields).toBeUndefined();
  });

  it("builds a monster card whose fields round-trip through monsterCardToCombatant", () => {
    const c = toMonsterCard(goblin);
    expect(c.kind).toBe("monster");
    expect(c.title).toBe("Goblin");
    expect(c.fields).toMatchObject({ ac: "15", hp: "7 (2d6)", cr: "1/4", type: "humanoid (goblinoid)", speed: "30 ft." });
    const combatant = monsterCardToCombatant(c, 10);
    expect(combatant.name).toBe("Goblin");
    expect(combatant.ac).toBe(15);
    expect(combatant.maxHp).toBe(7);
    expect(combatant.isPlayer).toBe(false);
  });

  it("builds a generic rule card with the content", () => {
    const c = toRuleCard(rule);
    expect(c.kind).toBe("generic");
    expect(c.title).toBe("Grappled");
    expect(c.markdown).toContain("Conditions");
    expect(c.markdown).toContain("speed becomes 0");
  });
});

describe("lookupDataset", () => {
  it("finds a spell exactly", () => {
    const r = lookupDataset("spell", "fireball");
    expect(r.exact?.title).toBe("Fireball");
  });
  it("returns candidates (no exact) for a partial spell query", () => {
    const r = lookupDataset("spell", "fire");
    expect(r.exact).toBeNull();
    expect(r.candidates.length).toBeGreaterThan(1);
    expect(r.candidates.length).toBeLessThanOrEqual(6);
    expect(r.candidates.some((c) => c.name === "Fireball")).toBe(true);
  });
  it("finds a monster exactly and its card round-trips", () => {
    const r = lookupDataset("monster", "goblin");
    expect(r.exact?.kind).toBe("monster");
    expect(r.exact?.title).toBe("Goblin");
    expect(r.exact?.fields?.ac).toBeTruthy();
  });
  it("finds a rule/condition exactly", () => {
    const r = lookupDataset("rule", "grappled");
    expect(r.exact?.title).toBe("Grappled");
  });
  it("returns empty for a nonsense arg", () => {
    const r = lookupDataset("spell", "zzzzznope");
    expect(r.exact).toBeNull();
    expect(r.candidates).toHaveLength(0);
  });
});

describe("resolveBundledSpell", () => {
  it("resolves a spell-card title (case-insensitively) to its bundled entry", () => {
    expect(resolveBundledSpell("Fireball")?.name).toBe("Fireball");
    expect(resolveBundledSpell("  fireball ")?.name).toBe("Fireball");
  });
  it("returns null for a name not in the bundle", () => {
    expect(resolveBundledSpell("Homebrew Zap")).toBeNull();
  });
});

describe("autoDetectLocal", () => {
  it("fires on a unique exact name across the union", () => {
    expect(autoDetectLocal("fireball")?.title).toBe("Fireball");
    expect(autoDetectLocal("goblin")?.kind).toBe("monster");
    expect(autoDetectLocal("grappled")?.title).toBe("Grappled");
  });
  it("fires after leading-filler stripping", () => {
    expect(autoDetectLocal("what is Fireball")?.title).toBe("Fireball");
  });
  it("does NOT fire on a partial", () => {
    expect(autoDetectLocal("fire")).toBeNull();
  });
  it("does NOT fire on a sentence with trailing words", () => {
    expect(autoDetectLocal("what does fireball do")).toBeNull();
    expect(autoDetectLocal("how do I run a chase scene")).toBeNull();
  });
  it("does NOT fire on empty / bare filler", () => {
    expect(autoDetectLocal("the")).toBeNull();
    expect(autoDetectLocal("")).toBeNull();
  });
});
