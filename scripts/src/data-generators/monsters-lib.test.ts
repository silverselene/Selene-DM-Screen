import { describe, expect, test } from "vitest";
import {
  baseType,
  canonicalPrefersOpen5e,
  cleanOpen5e,
  crValue,
  parseCSV,
  requireColumns,
  resolveFiveToolsKey,
  richMatchesCsv,
} from "./monsters-lib";

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
