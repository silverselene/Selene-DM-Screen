// The ONE rule for "these two names refer to the same person".
//
// Used by every collision check that matches a human by name: the party
// roster's "already in the party?" prompt (ChatCardActions.startAddToParty)
// and the Initiative tracker's duplicate-player confirm
// (`findDuplicatePlayer` in `combatant.ts`). Both prompts must agree on what
// "already there" means — a fold added to one and not the other is how the
// party widget starts saying "Aragorn is already in the party" while the
// initiative widget happily adds a second Aragorn.
//
// Deliberately narrow: trim + lowercase, nothing else. A diacritics fold or
// an internal-whitespace collapse would be defensible, but it belongs HERE so
// both call sites get it at once.

/** Normalize a display name to its comparison key. */
export function nameKey(name: string): string {
  return name.trim().toLowerCase();
}

/** True when two display names refer to the same person under `nameKey`. */
export function sameName(a: string, b: string): boolean {
  return nameKey(a) === nameKey(b);
}
