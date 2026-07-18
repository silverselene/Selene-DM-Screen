import { describe, expect, test } from "vitest";
import { stripTags } from "./lib";

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
