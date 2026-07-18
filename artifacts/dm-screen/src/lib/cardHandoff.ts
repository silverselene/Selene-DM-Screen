// Pure mapping from an AI-chat `tool_result` preview card into the shapes the
// Initiative and Party widgets already consume. No markdown re-parsing — we map
// the bridge's already-extracted `fields` (see services/ai-bridge/src/toolResults.ts).
// The d20 roll is injected so every mapper is deterministic and unit-testable.

import type { BridgeEvent } from "@/lib/aiBridge";
import type { Combatant, PlayerCharacter } from "@/types";
import { clampInitiative, mintCombatantId } from "@/lib/combatant";

/** The `tool_result` card variant. Defined here (the pure lib) rather than in the
 *  widget so both the card component and its actions import it without a cycle. */
export type ToolResultCard = Extract<BridgeEvent, { type: "tool_result" }>;

/** First integer in a ddb field string: "15 (natural armor)" → 15, "+2" → 2,
 *  "-1" → -1. Returns undefined when there is no number. */
export function parseLeadingInt(s: string | undefined): number | undefined {
  if (typeof s !== "string") return undefined;
  const m = /-?\d+/.exec(s);
  return m ? parseInt(m[0], 10) : undefined;
}

/** Parse a character card's "cur/max" HP, or a single monster HP value (used for
 *  both cur and max). Unparseable/absent → {0,0}. */
export function parseHp(s: string | undefined): { cur: number; max: number } {
  if (typeof s !== "string") return { cur: 0, max: 0 };
  const pair = /(\d+)\s*\/\s*(\d+)/.exec(s);
  if (pair) return { cur: parseInt(pair[1], 10), max: parseInt(pair[2], 10) };
  const single = /\d+/.exec(s);
  const n = single ? parseInt(single[0], 10) : 0;
  return { cur: n, max: n };
}

/** True when a card's HP field yields a usable (> 0) max through the SAME
 *  parseHp the mappers use, so this can't drift from what actually gets minted.
 *  parseHp maps a missing/unreadable field — and a literal "0"/"0 (unknown)",
 *  which a summary-only sheet emits — to a 0 max, which downstream renders as a
 *  downed combatant, indistinguishable from a PC actually at 0 HP. The
 *  add-to-initiative UI checks this first so those cases get an explicit "set HP
 *  manually" note instead of silently minting a 0/0 combatant. */
export function cardHasParseableHp(card: ToolResultCard): boolean {
  return parseHp(card.fields?.hp).max > 0;
}

/** Monster → combatant: full HP, no init modifier available (plain d20). */
export function monsterCardToCombatant(card: ToolResultCard, d20: number): Combatant {
  const f = card.fields ?? {};
  const { max } = parseHp(f.hp);
  return {
    id: mintCombatantId(),
    name: card.title,
    initiative: clampInitiative(String(d20)),
    hp: max,
    maxHp: max,
    ac: parseLeadingInt(f.ac),
    isPlayer: false,
  };
}

/** Character → combatant: cur/max HP split, initiative = d20 + the card's bonus. */
export function characterCardToCombatant(card: ToolResultCard, d20: number): Combatant {
  const f = card.fields ?? {};
  const { cur, max } = parseHp(f.hp);
  const bonus = parseLeadingInt(f.initiative) ?? 0;
  return {
    id: mintCombatantId(),
    name: card.title,
    initiative: clampInitiative(String(d20 + bonus)),
    hp: cur,
    maxHp: max,
    ac: parseLeadingInt(f.ac),
    isPlayer: true,
  };
}

/** The party-roster fields a character card can populate through the collision
 *  edit form. Excludes `id` (minted by the store) and `spells`/`weapons` (not
 *  hand-editable in the form — they ride along from the card via
 *  `cardSpellWeaponLists`). Doubles as the edit-form state shape in
 *  ChatCardActions. */
export type PlayerDraft = Omit<PlayerCharacter, "id" | "spells" | "weapons">;

/** Sanitize a card's `spells`/`weapons` into clean roster lists: trim, drop
 *  empties, de-dup case-insensitively (first spelling wins). A card without the
 *  lists (monster card, summary-only character sheet) yields empty arrays. */
export function cardSpellWeaponLists(card: ToolResultCard): { spells: string[]; weapons: string[] } {
  return { spells: cleanNameList(card.spells), weapons: cleanNameList(card.weapons) };
}

function cleanNameList(raw: string[] | undefined): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const name = item.trim();
    const key = name.toLowerCase();
    if (name && !seen.has(key)) {
      seen.add(key);
      out.push(name);
    }
  }
  return out;
}

/** Union of two roster lists, case-insensitive, `base` order first. Used when
 *  re-importing over an existing sheet so neither the DM's hand-added entries
 *  nor the freshly imported ones are lost. */
export function mergeNameLists(base: string[], extra: string[]): string[] {
  const seen = new Set(base.map((s) => s.toLowerCase()));
  const out = [...base];
  for (const name of extra) {
    const key = name.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      out.push(name);
    }
  }
  return out;
}

export interface DiffRow {
  field: keyof PlayerDraft;
  label: string;
  before: string;
  after: string;
}

/** Character card → editable party draft. Level defaults to 1; HP uses the max;
 *  every other absent field is null. */
export function characterCardToPlayerDraft(card: ToolResultCard): PlayerDraft {
  const f = card.fields ?? {};
  return {
    name: card.title,
    race: f.race ?? null,
    class: f.class ?? null,
    level: parseLeadingInt(f.level) ?? 1,
    ac: parseLeadingInt(f.ac) ?? null,
    hp: f.hp !== undefined ? parseHp(f.hp).max : null,
  };
}

function nonNegIntOrNull(n: number | null): number | null {
  if (n === null || !Number.isFinite(n)) return null;
  const t = Math.trunc(n);
  return t < 0 ? null : t;
}

/** Coerce a (possibly DM-edited) draft into partyStore's write input. The store's
 *  own normalize()/clamps are the backstop; this closes the obvious holes first.
 *  `spells`/`weapons` (from the card, not the edit form) default to empty. */
export function draftToPlayerInput(
  draft: PlayerDraft,
  lists: { spells: string[]; weapons: string[] } = { spells: [], weapons: [] },
): Omit<PlayerCharacter, "id"> {
  const level = Number.isFinite(draft.level) ? Math.max(1, Math.trunc(draft.level)) : 1;
  return {
    name: draft.name,
    race: draft.race && draft.race.trim() ? draft.race : null,
    class: draft.class && draft.class.trim() ? draft.class : null,
    level,
    ac: nonNegIntOrNull(draft.ac),
    hp: nonNegIntOrNull(draft.hp),
    spells: lists.spells,
    weapons: lists.weapons,
  };
}

// The shared fields a character card and a party entry both carry, in display
// order, each tagged with the input type the collision form renders. Spell
// slots / current HP are deliberately absent (see the design doc). Single
// source of truth for BOTH the collision edit form (ChatCardActions) and the
// change-only diff below, so the editable rows and the diff/"identical" check
// can't drift apart.
export const PLAYER_DRAFT_FIELDS: {
  field: keyof PlayerDraft;
  label: string;
  type: "number" | "text";
}[] = [
  { field: "level", label: "Level", type: "number" },
  { field: "class", label: "Class", type: "text" },
  { field: "race", label: "Race", type: "text" },
  { field: "ac", label: "AC", type: "number" },
  { field: "hp", label: "HP", type: "number" },
];

/** Changed-only field diff between an existing roster entry and a draft, for the
 *  collision prompt's row highlighting and its "identical sheets" check. */
export function diffPlayer(existing: PlayerCharacter, draft: PlayerDraft): DiffRow[] {
  const rows: DiffRow[] = [];
  for (const { field, label } of PLAYER_DRAFT_FIELDS) {
    const before = String(existing[field] ?? "");
    const after = String(draft[field] ?? "");
    if (before !== after) rows.push({ field, label, before, after });
  }
  return rows;
}
