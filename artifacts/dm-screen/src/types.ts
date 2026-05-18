export type WidgetType = "compendium" | "initiative" | "notepad" | "oracle" | "bestiary" | "wizard-tome" | "party" | "empty";

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
