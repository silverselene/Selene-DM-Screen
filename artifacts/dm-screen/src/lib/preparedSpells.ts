// Prepared vs. known spells for a party member.
//
// `PlayerCharacter.spells` is everything the character knows (for a Wizard,
// the whole spellbook); `prepared` says which of those are prepared — castable
// right now. `prepared == null` means no explicit choice, so every spell
// counts as prepared (the roster's meaning before the field existed, and the
// right default for hand-entered characters).
//
// Cantrips are always castable, so the D&D Beyond import marks them prepared;
// beyond that the DM can prepare / unprepare any spell by hand.

import type { PlayerCharacter } from "@/types";

type SpellLists = Pick<PlayerCharacter, "spells" | "prepared">;

const lower = (s: string) => s.trim().toLowerCase();

export function isPrepared(c: SpellLists, spell: string): boolean {
  if (c.prepared == null) return true;
  const k = lower(spell);
  return c.prepared.some((p) => lower(p) === k);
}

/** Split a character's spells, keeping their order, into the prepared ones
 *  and the known-but-not-prepared rest. */
export function splitSpells(c: SpellLists): { prepared: string[]; known: string[] } {
  const prepared: string[] = [];
  const known: string[] = [];
  for (const s of c.spells ?? []) (isPrepared(c, s) ? prepared : known).push(s);
  return { prepared, known };
}

/** The explicit prepared list after flipping one spell. A `null` list (all
 *  prepared) becomes explicit the first time anything is toggled. */
export function togglePrepared(c: SpellLists, spell: string): string[] {
  const k = lower(spell);
  const current = c.prepared ?? c.spells;
  return isPrepared(c, spell)
    ? current.filter((p) => lower(p) !== k)
    : [...current, spell];
}

/** The prepared list after adding a spell in the edit form: a newly added
 *  spell is prepared (the DM is usually adding something the character can
 *  cast); unprepare it with a click if it's a spellbook entry. */
export function preparedAfterAdding(c: SpellLists, spell: string): string[] | null {
  if (c.prepared == null) return null; // still "all prepared"
  return isPrepared(c, spell) ? c.prepared : [...c.prepared, spell];
}
