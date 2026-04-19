export type WidgetType = "compendium" | "initiative" | "notepad" | "oracle" | "bestiary" | "wizard-tome" | "empty";

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
