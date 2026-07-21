// The runtime array is the source of truth; the type is derived from it.
// Adding/removing a widget kind here updates both the union and any
// runtime allowlist (e.g. backup validators, recent-widgets filters).
export const WIDGET_TYPES = [
  "compendium",
  "initiative",
  "notepad",
  "oracle",
  "bestiary",
  "wizard-tome",
  "party",
  "portal",
  "ai-chat",
  "empty",
] as const;

export type WidgetType = (typeof WIDGET_TYPES)[number];

// Real, placeable widgets — `WIDGET_TYPES` minus the `"empty"` placeholder.
// Used to validate the recent-widgets list, which only ever holds widgets a
// DM actually opened (see `pushRecent`, which filters `"empty"` out). Keeping
// `"empty"` out of the validator stops a hand-edited/backup value from
// rendering a dead "empty" chip or a redundant-tile restore action.
export const PLACEABLE_WIDGET_TYPES = WIDGET_TYPES.filter(
  (w): w is Exclude<WidgetType, "empty"> => w !== "empty",
);

// Widgets that may appear on at most one tile. AI Chat persists a single
// shared transcript (see chatHistory.ts); Initiative persists the single
// live combat encounter (dm-initiative-v1 plus its round/turn keys): in both
// cases every mounted copy holds an independent in-memory snapshot with
// whole-value writes and no same-tab change event, so two live copies
// clobber each other's state last-writer-wins. Enforced at placement time
// (widget selector + recent-widgets restore, see App.tsx) and again at mount
// time inside each widget itself, which also covers tiles arriving via a
// restored backup or hand-edited storage.
export const SINGLETON_WIDGET_TYPES: ReadonlySet<WidgetType> = new Set([
  "ai-chat",
  "initiative",
]);

export type TileEntry = {
  widget: WidgetType;
  colSpan: 1 | 2;
  rowSpan: 1 | 2;
} | null;

export interface Combatant {
  id: string;
  name: string;
  initiative: number;
  hp: number;
  maxHp: number;
  ac?: number;
  isPlayer: boolean;
}

export interface PlayerCharacter {
  id: number;
  name: string;
  race: string | null;
  class: string | null;
  level: number;
  ac: number | null;
  hp: number | null;
  spells: string[];
  weapons: string[];
}
