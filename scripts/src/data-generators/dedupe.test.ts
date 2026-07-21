import { describe, expect, test } from "vitest";
import { dedupeByName, dropSeenTitles, slugify } from "./dedupe";

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

  test("reports a collision when distinct names collapse to one slug", () => {
    const collisions: unknown[] = [];
    dedupeByName(
      [
        { name: "Fey Touched", source: "TCE" },
        { name: "Fey-Touched", source: "XPHB" },
      ],
      (c) => collisions.push(c),
    );
    expect(collisions).toEqual([
      { slug: "fey-touched", names: ["Fey Touched", "Fey-Touched"], kept: "Fey-Touched" },
    ]);
  });

  test("an exact-duplicate name is not reported as a collision", () => {
    const collisions: unknown[] = [];
    dedupeByName(
      [
        { name: "Alert", source: "XPHB" },
        { name: "Alert", source: "PHB" },
      ],
      (c) => collisions.push(c),
    );
    expect(collisions).toHaveLength(0);
  });
});

// The compendium is assembled section-by-section; each section skips only the
// hand-curated titles, so a feat emitted by the 5etools pass (feat-survivor)
// could ship again from the Open5e pass (feat-a5e-survivor) as a second
// "Survivor". dropSeenTitles threads a running set across sections so the later
// section drops an entry an earlier one already emitted. The caller supplies the
// key, and the compendium keys on category+title so distinct entries that merely
// share a title across categories are NOT dropped.
describe("dropSeenTitles", () => {
  const key = (e: { category: string; title: string }) =>
    `${e.category} ${e.title.toLowerCase()}`;

  test("drops entries whose key is already in the seen set", () => {
    const seen = new Set<string>(["Feats survivor"]);
    const out = dropSeenTitles(
      [
        { category: "Feats", title: "Survivor" },
        { category: "Feats", title: "Tough" },
      ],
      seen,
      key,
    );
    expect(out.map((e) => e.title)).toEqual(["Tough"]);
  });

  test("accumulates newly-emitted keys into the running set", () => {
    const seen = new Set<string>();
    dropSeenTitles([{ category: "Feats", title: "Alert" }], seen, key);
    expect(seen.has("Feats alert")).toBe(true);
  });

  test("first occurrence wins across successive calls (cross-section dedup)", () => {
    const seen = new Set<string>();
    const a = dropSeenTitles(
      [{ category: "Feats", title: "Survivor", pass: "5etools" }],
      seen,
      key,
    );
    const b = dropSeenTitles(
      [{ category: "Feats", title: "Survivor", pass: "open5e" }],
      seen,
      key,
    );
    expect(a).toHaveLength(1);
    expect(b).toHaveLength(0);
  });

  test("same title in different categories is NOT dropped", () => {
    const seen = new Set<string>();
    const a = dropSeenTitles([{ category: "Actions in Combat", title: "Hide" }], seen, key);
    const b = dropSeenTitles([{ category: "Skills", title: "Hide" }], seen, key);
    expect(a).toHaveLength(1);
    expect(b).toHaveLength(1);
  });
});

describe("slugify", () => {
  test("space and hyphen variants collapse to the same slug", () => {
    expect(slugify("Fey Touched")).toBe("fey-touched");
    expect(slugify("Fey-Touched")).toBe("fey-touched");
  });
});
