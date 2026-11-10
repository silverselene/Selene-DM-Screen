// Placement rule for the cross-widget "open this in <widget>" hand-offs
// (`dm-open-bestiary`, `dm-open-spell`), routed by App.tsx. Pure so the rule
// is unit-testable without mounting the dashboard.

import type { TileEntry, WidgetType } from "@/types";

export type OpenInWidgetPlan =
  /** The widget is already on the board — just hand it the target. */
  | { kind: "present" }
  /** Not on the board; `next` places it (1×1) in the first empty tile. */
  | { kind: "place"; next: TileEntry[] }
  /** Not on the board and no empty tile to put it in. */
  | { kind: "no-room" };

export function planOpenInWidget(
  tiles: readonly TileEntry[],
  widget: Exclude<WidgetType, "empty">,
): OpenInWidgetPlan {
  if (tiles.some((t) => t !== null && t.widget === widget)) return { kind: "present" };
  const idx = tiles.findIndex((t) => t !== null && t.widget === "empty");
  if (idx === -1) return { kind: "no-room" };
  const next = [...tiles];
  next[idx] = { widget, colSpan: 1, rowSpan: 1 };
  return { kind: "place", next };
}
