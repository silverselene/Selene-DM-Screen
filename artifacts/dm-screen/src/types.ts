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
  "empty",
] as const;

export type WidgetType = (typeof WIDGET_TYPES)[number];

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
