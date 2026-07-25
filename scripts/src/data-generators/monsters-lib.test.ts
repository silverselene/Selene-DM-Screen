import { describe, expect, test } from "vitest";
import {
  baseType,
  canonicalPrefersOpen5e,
  cleanOpen5e,
  crValue,
  parseCSV,
  renderSpellcasting,
  requireColumns,
  resolveFiveToolsKey,
  richMatchesCsv,
} from "./monsters-lib";
import { renderEntries } from "./lib";

describe("parseCSV", () => {
  test("splits rows and columns", () => {
    expect(parseCSV("a,b,c\n1,2,3\n")).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
    ]);
  });

  test("keeps commas inside quoted fields", () => {
    expect(parseCSV('Name,Type\n"Harpy, Plague",Monstrosity\n')).toEqual([
      ["Name", "Type"],
      ["Harpy, Plague", "Monstrosity"],
    ]);
  });

  test("unescapes doubled quotes and handles a trailing row with no newline", () => {
    expect(parseCSV('q\n"say ""hi"""')).toEqual([["q"], ['say "hi"']]);
  });

  test("drops fully-empty lines", () => {
    expect(parseCSV("a\n\n\nb\n")).toEqual([["a"], ["b"]]);
  });
});

describe("requireColumns", () => {
  test("maps each required header to its index", () => {
    expect(requireColumns(["Name", "AC", "CR"], ["Name", "CR"])).toEqual({
      Name: 0,
      CR: 2,
    });
  });

  test("throws naming every missing column (renamed AC → Armor Class)", () => {
    expect(() =>
      requireColumns(["Name", "Armor Class", "CR"], ["Name", "AC", "CR"]),
    ).toThrow(/AC/);
  });

  test("throw message lists all missing columns, not just the first", () => {
    expect(() => requireColumns(["Name"], ["AC", "Type"])).toThrow(/AC.*Type/);
  });
});

describe("cleanOpen5e", () => {
  test("decodes HTML entities", () => {
    expect(cleanOpen5e("fire &amp; ice")).toBe("fire & ice");
    expect(cleanOpen5e("a &lt; b &gt; c &quot;d&quot; &#39;e&#39;")).toBe(
      "a < b > c \"d\" 'e'",
    );
  });

  test("strips BBCode [++] / [/++] markers", () => {
    expect(cleanOpen5e("[++]Languages[/++] as Phoenixborn")).toBe(
      "Languages as Phoenixborn",
    );
  });

  test("strips markdown emphasis asterisks", () => {
    expect(cleanOpen5e("*At Will:* Fireball")).toBe("At Will: Fireball");
  });

  test("cleans the real garbled Phoenixborn resistances string", () => {
    const out = cleanOpen5e("[++], Senses, &amp; [/++][++]Languages[/++] as Phoenixborn");
    expect(out).not.toContain("[");
    expect(out).not.toContain("&amp;");
    expect(out).toContain("Senses");
    expect(out).toContain("Languages as Phoenixborn");
    // No leading punctuation left behind by the stripped BBCode marker.
    expect(out).toBe("Senses, & Languages as Phoenixborn");
  });

  test("trims leading punctuation a stripped marker leaves behind", () => {
    expect(cleanOpen5e("[b]; hello")).toBe("hello");
  });
});

describe("crValue", () => {
  test("parses whole numbers and fractions", () => {
    expect(crValue("2")).toBe(2);
    expect(crValue("1/2")).toBe(0.5);
    expect(crValue("1/8")).toBe(0.125);
  });

  test("empty / whitespace / malformed → null (fail closed)", () => {
    expect(crValue("")).toBeNull();
    expect(crValue("   ")).toBeNull();
    expect(crValue("n/0")).toBeNull();
    expect(crValue("Unknown")).toBeNull();
  });
});

describe("baseType", () => {
  test("lowercases and drops a parenthetical subtype", () => {
    expect(baseType("Dragon (metallic)")).toBe("dragon");
    expect(baseType("Humanoid")).toBe("humanoid");
  });

  test("empty / unknown → null", () => {
    expect(baseType("")).toBeNull();
    expect(baseType("unknown")).toBeNull();
  });
});

describe("richMatchesCsv", () => {
  test("agrees when CR and base type match", () => {
    expect(
      richMatchesCsv({ cr: "1", type: "Humanoid" }, { cr: "1", type: "humanoid" }),
    ).toBe(true);
  });

  test("rejects on CR disagreement", () => {
    expect(
      richMatchesCsv({ cr: "1", type: "Humanoid" }, { cr: "5", type: "humanoid" }),
    ).toBe(false);
  });

  test("rejects on base-type disagreement when both known", () => {
    expect(
      richMatchesCsv({ cr: "1", type: "Humanoid" }, { cr: "1", type: "beast" }),
    ).toBe(false);
  });

  test("passes when one type is unknown (don't hold it against a CR match)", () => {
    expect(
      richMatchesCsv({ cr: "1", type: "" }, { cr: "1", type: "beast" }),
    ).toBe(true);
  });

  test("unparseable CR fails closed", () => {
    expect(
      richMatchesCsv({ cr: "", type: "Humanoid" }, { cr: "", type: "humanoid" }),
    ).toBe(false);
  });
});

describe("resolveFiveToolsKey", () => {
  const index = new Map<string, unknown>([
    ["goblin", 1],
    ["succubus", 1],
    ["giant rat", 1],
  ]);

  test("exact match is faithful (not lossy)", () => {
    expect(resolveFiveToolsKey("Goblin", index)).toEqual({
      key: "goblin",
      lossy: false,
    });
  });

  test("(+) reprint marker strip stays faithful", () => {
    expect(resolveFiveToolsKey("Goblin (+)", index)).toEqual({
      key: "goblin",
      lossy: false,
    });
  });

  test("slash-split is a lossy match", () => {
    expect(resolveFiveToolsKey("Succubus/Incubus", index)).toEqual({
      key: "succubus",
      lossy: true,
    });
  });

  test("parenthetical qualifier strip is lossy", () => {
    expect(resolveFiveToolsKey("Giant Rat (Diseased)", index)).toEqual({
      key: "giant rat",
      lossy: true,
    });
  });

  test("no match → null", () => {
    expect(resolveFiveToolsKey("Beholder", index)).toBeNull();
  });
});

describe("canonicalPrefersOpen5e", () => {
  test("true for a CSV row sourced from a third-party Open5e book", () => {
    expect(canonicalPrefersOpen5e("A5e Monstrous Menagerie")).toBe(true);
    expect(canonicalPrefersOpen5e("Tome of Beasts")).toBe(true);
  });

  test("false for a WotC / SRD source or undefined", () => {
    expect(canonicalPrefersOpen5e("5e SRD")).toBe(false);
    expect(canonicalPrefersOpen5e("")).toBe(false);
    expect(canonicalPrefersOpen5e(undefined)).toBe(false);
  });
});

// The 5etools `spellcasting` array was silently dropped by the generator until
// this helper existed, so every WotC caster shipped with no spells. These
// fixtures mirror the schema's real shapes (structured group keys, the "e"
// = "each" suffix, `displayAs`, `hidden`) and assert the output lands in the
// prose format `src/lib/statblockCombat.ts` parses in the app — the two are a
// producer/consumer pair, so a format change here must be made in both.
describe("renderSpellcasting", () => {
  const render = (block: Parameters<typeof renderSpellcasting>[0]) =>
    renderSpellcasting(block, renderEntries);

  test("renders a prepared-caster slot list as labelled lines", () => {
    const out = render({
      headerEntries: [
        "The mage is a 9th-level spellcaster. Its spellcasting ability is Intelligence (spell save DC 14, {@hit 6} to hit with spell attacks). The mage has the following wizard spells prepared:",
      ],
      spells: {
        "0": { spells: ["{@spell fire bolt}", "{@spell light}"] },
        "1": { slots: 4, spells: ["{@spell mage armor}", "{@spell magic missile}"] },
        "3": { slots: 3, spells: ["{@spell counterspell}", "{@spell fireball}"] },
      },
      ability: "int",
    });
    expect(out).not.toBeNull();
    expect(out!.name).toBe("Spellcasting");
    expect(out!.displayAs).toBe("trait");
    // `{@hit 6}` → "+6", which is what the app reads as the spell attack bonus.
    expect(out!.desc).toContain("+6 to hit with spell attacks");
    expect(out!.desc).toContain("Cantrips (at will): fire bolt, light");
    expect(out!.desc).toContain("1st level (4 slots): mage armor, magic missile");
    expect(out!.desc).toContain("3rd level (3 slots): counterspell, fireball");
  });

  test("expands the 'e' use-suffix to 'Each' and orders groups by use count", () => {
    const out = render({
      will: ["{@spell tongues}"],
      daily: {
        "3e": ["{@spell dispel magic}", "{@spell enhance ability}"],
        "1": ["{@spell dominate person}"],
      },
    });
    const lines = out!.desc.split("\n").filter(Boolean);
    expect(lines).toEqual([
      "At Will: tongues",
      "1/Day: dominate person",
      "3/Day Each: dispel magic, enhance ability",
    ]);
  });

  test("uses the singular slot label for a single slot", () => {
    const out = render({ spells: { "6": { slots: 1, spells: ["{@spell disintegrate}"] } } });
    expect(out!.desc).toBe("6th level (1 slot): disintegrate");
  });

  test("omits the slot count when the source gives none", () => {
    const out = render({ spells: { "2": { spells: ["{@spell invisibility}"] } } });
    expect(out!.desc).toBe("2nd level: invisibility");
  });

  test("routes a 2024 block into the actions section", () => {
    const out = render({
      name: "Spellcasting",
      displayAs: "action",
      headerEntries: ["The lich casts one of the following spells, using Intelligence as the spellcasting ability (spell save DC 20):"],
      will: ["{@spell detect magic}"],
    });
    expect(out!.displayAs).toBe("action");
  });

  test("keeps the source's own block name", () => {
    const out = render({ name: "Innate Spellcasting (Psionics)", will: ["{@spell detect thoughts}"] });
    expect(out!.name).toBe("Innate Spellcasting (Psionics)");
  });

  test("skips a group 5etools marks hidden", () => {
    // `hidden` marks spells consumed by another feature; 5etools does not list
    // them, and listing them here would invent options the monster lacks.
    const out = render({
      headerEntries: ["It can innately cast the following spells:"],
      will: ["{@spell mage hand}"],
      daily: { "1e": ["{@spell plane shift}"] },
      hidden: ["daily"],
    });
    expect(out!.desc).toContain("At Will: mage hand");
    expect(out!.desc).not.toContain("plane shift");
  });

  test("renders constant and ritual groups", () => {
    const out = render({
      constant: ["{@spell mage armor}"],
      ritual: ["{@spell detect magic}"],
    });
    // Group lines share one block, separated by single newlines; only the
    // header/footer prose is set off by a blank line.
    expect(out!.desc).toBe("Constant: mage armor\nRituals: detect magic");
  });

  test("appends footer entries after the groups", () => {
    const out = render({
      will: ["{@spell darkness}"],
      footerEntries: ["*The demon casts these spells innately."],
    });
    expect(out!.desc).toBe("At Will: darkness\n\n*The demon casts these spells innately.");
  });

  test("returns null for a block with neither groups nor header text", () => {
    expect(render({})).toBeNull();
    expect(render({ spells: {} })).toBeNull();
  });

  test("keeps a header-only block, which still tells the DM the save DC", () => {
    const out = render({ headerEntries: ["Its spellcasting ability is Charisma (spell save DC 17)."] });
    expect(out!.desc).toContain("spell save DC 17");
  });
});
