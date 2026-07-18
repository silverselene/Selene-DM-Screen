import { describe, expect, test } from "vitest";
import { dedupeByName, slugify } from "./dedupe";

describe("dedupeByName", () => {
  // Regression: 5etools names these feats "Fey Touched" (TCE) but
  // "Fey-Touched" (XPHB). Ids are minted with slugify(name), which collapses
  // both spellings to "fey-touched" — so if dedupe keys on anything weaker
  // than the slug, both survive and ship with colliding ids (duplicate React
  // keys in the Compendium widget). The dedupe key must be the id key.
  test("merges names that slugify identically, keeping the priority source", () => {
    const items = [
      { name: "Fey Touched", source: "TCE" },
      { name: "Fey-Touched", source: "XPHB" },
    ];
    const out = dedupeByName(items);
    expect(out).toHaveLength(1);
    expect(out[0]!.source).toBe("XPHB");
  });

  test("case variants merge, first-found wins among unranked sources", () => {
    const out = dedupeByName([
      { name: "Alert", source: "ZZZ" },
      { name: "ALERT", source: "YYY" },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]!.source).toBe("ZZZ");
  });

  test("distinct names stay distinct", () => {
    const out = dedupeByName([
      { name: "Alert", source: "XPHB" },
      { name: "Lucky", source: "XPHB" },
    ]);
    expect(out).toHaveLength(2);
  });
});

describe("slugify", () => {
  test("space and hyphen variants collapse to the same slug", () => {
    expect(slugify("Fey Touched")).toBe("fey-touched");
    expect(slugify("Fey-Touched")).toBe("fey-touched");
  });
});
