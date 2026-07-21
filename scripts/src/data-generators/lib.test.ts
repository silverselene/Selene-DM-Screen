import { describe, expect, test } from "vitest";
import { generatedHeader, stripTags } from "./lib";

// {@recharge N} is the one-arg form 5etools uses on breath weapons and
// similar limited-use actions; the renderer shows "(Recharge N–6)" (en dash),
// or "(Recharge 6)" for both {@recharge 6} and the bare {@recharge}.
// Regression: the one-arg form used to fall through to the generic
// first-pipe-segment rule, turning "Fire Breath {@recharge 5}" into
// "Fire Breath 5" — the recharge mechanic vanished from 96 action names.
describe("stripTags {@recharge}", () => {
  test("one-arg form renders the die range", () => {
    expect(stripTags("Fire Breath {@recharge 5}")).toBe(
      "Fire Breath (Recharge 5–6)",
    );
  });

  test("{@recharge 6} renders without a range", () => {
    expect(stripTags("Lightning Strike {@recharge 6}")).toBe(
      "Lightning Strike (Recharge 6)",
    );
  });

  test("bare {@recharge} means recharge-on-6", () => {
    expect(stripTags("Teleport {@recharge}")).toBe("Teleport (Recharge 6)");
  });
});

// The single-pass generic rule matched `{@tag [^}]*}` — its payload ran across
// an *inner* tag's opening `{`, so a nested `{@note ... {@damage 2d6} ...}` left
// the inner tag's leader (`@damage 2d6`) as visible residue in the output.
// Confirmed live leaks: weapons.ts "extra @damage 2d6 …" / "paired with @item
// True-Ice Shards", compendiumRules.ts "used to @book stabilize a creature" /
// "@link intended for NPCs" / "@deck Tarokka Deck".
describe("stripTags nested tags", () => {
  test("a lone inner-style tag still resolves (non-nested sanity)", () => {
    expect(stripTags("paired with {@item True-Ice Shards}")).toBe(
      "paired with True-Ice Shards",
    );
  });

  test("a tag nested inside another leaves no @tag residue", () => {
    expect(stripTags("{@note extra {@damage 2d6} damage}")).toBe(
      "extra 2d6 damage",
    );
  });

  test("nested {@item} inside a {@note} unwraps both", () => {
    expect(stripTags("{@note paired with {@item True-Ice Shards}}")).toBe(
      "paired with True-Ice Shards",
    );
  });

  test("nested {@book} / {@link} / {@deck} leave clean prose", () => {
    expect(stripTags("{@note used to {@book stabilize a creature}}")).toBe(
      "used to stabilize a creature",
    );
    expect(stripTags("{@note {@link intended for NPCs}}")).toBe(
      "intended for NPCs",
    );
    expect(stripTags("{@note {@deck Tarokka Deck}}")).toBe("Tarokka Deck");
  });
});

// Mixed-license outputs (monsters.ts, compendiumRules.ts) pull from Open5e in
// addition to 5etools, so the header must be able to name the extra pin and the
// OGL/CC-BY license — the defaults only mention 5etools/MIT.
describe("generatedHeader provenance", () => {
  test("defaults still name the 5etools pin and MIT license", () => {
    const h = generatedHeader({ source: "src", generator: "g.ts" });
    expect(h).toContain("5etools-src @ v2.31.0");
    expect(h).toContain("MIT-licensed");
  });

  test("extra pin and license lines are emitted", () => {
    const h = generatedHeader({
      source: "src",
      generator: "generate-monsters.ts",
      pins: ["open5e-api @ v1.12.0"],
      licenses: ["Open5e third-party content is OGL v1.0a / CC-BY 4.0."],
    });
    expect(h).toContain("5etools-src @ v2.31.0");
    expect(h).toContain("open5e-api @ v1.12.0");
    expect(h).toContain("Open5e third-party content is OGL v1.0a / CC-BY 4.0.");
  });
});
