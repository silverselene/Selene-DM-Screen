import { describe, it, expect } from "vitest";

import type { TileEntry } from "@/types";
import { planOpenInWidget } from "./openInWidget";

const t = (widget: string, colSpan = 1, rowSpan = 1) =>
  ({ widget, colSpan, rowSpan }) as TileEntry;

describe("planOpenInWidget", () => {
  it("reports a widget already on the board as present (no layout change)", () => {
    expect(planOpenInWidget([t("party"), t("wizard-tome"), t("empty")], "wizard-tome")).toEqual({
      kind: "present",
    });
  });

  it("places a missing widget in the first empty tile, skipping span placeholders", () => {
    const tiles = [t("party", 2), null, t("notepad"), t("empty"), t("empty")];
    const plan = planOpenInWidget(tiles, "wizard-tome");
    expect(plan.kind).toBe("place");
    if (plan.kind !== "place") return;
    expect(plan.next[3]).toEqual({ widget: "wizard-tome", colSpan: 1, rowSpan: 1 });
    expect(plan.next[1]).toBeNull();
    expect(plan.next[4]).toEqual(t("empty"));
    // Pure: the input array is untouched.
    expect(tiles[3]).toEqual(t("empty"));
  });

  it("reports no-room when the widget is absent and every tile is taken", () => {
    expect(planOpenInWidget([t("party"), t("notepad")], "bestiary")).toEqual({ kind: "no-room" });
  });
});
