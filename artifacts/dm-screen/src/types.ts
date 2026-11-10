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

// Widgets that may appear on at most one tile. Every one of these persists all
// its state on shared storage key(s) — AI Chat a single transcript, Initiative
// the live encounter, the rest their query/filter/selection/notes — and every
// mounted copy holds an independent in-memory snapshot with whole-value writes
// and no same-tab change event, so two live copies clobber each other's state
// last-writer-wins (Notepad loses typed prose; the others reset their view
// state). Because they share the key, a second tile never showed independent
// state anyway. Party is exempt: partyStore broadcasts `dm-party-changed`, so
// its two tiles stay in sync instead of clobbering. Enforced at placement time
// (widget selector + recent-widgets restore, see App.tsx) and again at mount
// time inside each widget via SingletonGate, which also covers tiles arriving
// via a restored backup or hand-edited storage.
export const SINGLETON_WIDGET_TYPES: ReadonlySet<WidgetType> = new Set([
  "ai-chat",
  "initiative",
  "notepad",
  "oracle",
  "bestiary",
  "compendium",
  "wizard-tome",
  "portal",
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
  /**
   * The bestiary entry this combatant was added from, when it came from the
   * monster search. Lets the tracker show the creature's attacks and spells
   * inline even after the DM renames the row to "Goblin #2 (archer)" — the
   * display name alone only resolves through the suffix-stripping fallback in
   * `findCombatantMonster`.
   *
   * Purely additive and optional, so `dm-initiative-v1` did NOT need a version
   * bump: an older build reading a newer list drops the field in
   * `validateCombatants`' whitelist rebuild (the panel just doesn't appear), and
   * a newer build reading an older list sees `undefined` and falls back to the
   * name. Neither direction can produce the corrupt-state crash a version bump
   * exists to prevent.
   */
  monsterName?: string;
}

/** The six ability scores. Each is null when unknown (e.g. a hand-entered
 *  character whose sheet the DM hasn't filled in). */
export interface AbilityScores {
  str: number | null;
  dex: number | null;
  con: number | null;
  int: number | null;
  wis: number | null;
  cha: number | null;
}

export const ABILITY_KEYS = ["str", "dex", "con", "int", "wis", "cha"] as const;
export type AbilityKey = (typeof ABILITY_KEYS)[number];

export interface PlayerCharacter {
  id: number;
  name: string;
  race: string | null;
  class: string | null;
  level: number;
  ac: number | null;
  hp: number | null;
  spells: string[];
  /** Which of `spells` are prepared (castable now). `null`/absent = no
   *  explicit choice, so every spell counts as prepared — the meaning the
   *  roster had before this field existed. When set, it's a subset of
   *  `spells` (the store enforces that); spells not in it are known but
   *  not prepared (e.g. a Wizard's spellbook). Additive and optional, so
   *  the stored key didn't need a version bump — see partyStore.normalize. */
  prepared?: string[] | null;
  weapons: string[];
  /** Ability scores for the character sheet. Optional and additive like
   *  `prepared`: absent/null = not recorded. Filled by the D&D Beyond import. */
  abilities?: AbilityScores | null;
  /** Link to the character's D&D Beyond sheet. Optional and additive; only
   *  https dndbeyond.com URLs survive the store's normalizer. */
  ddbUrl?: string | null;
}
