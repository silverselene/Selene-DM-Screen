export type WidgetType = "compendium" | "initiative" | "notepad" | "oracle" | "empty";

export interface TileConfig {
  id: number;
  widget: WidgetType;
}

export interface Combatant {
  id: string;
  name: string;
  initiative: number;
  hp: number;
  maxHp: number;
  isPlayer: boolean;
}

export interface GridState {
  tiles: TileConfig[];
  currentTurn: number;
}
