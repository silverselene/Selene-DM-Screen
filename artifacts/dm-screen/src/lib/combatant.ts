// Shape helpers for the Initiative tracker's `Combatant`. Mirrors how
// `partyStore.ts` owns the `PlayerCharacter` shape — same concerns
// (normalize-on-import, defend against malformed reads, cap pathological
// list lengths) just for the in-progress combat state.
//
// `validateCombatants` is consumed in two places: the backup-import path
// (`backup.ts`) and the read path via `useLocalStorage` in
// `InitiativeWidget.tsx`. Both call the same function so the shape
// contract stays in one place.

import type { Combatant } from "@/types";

export const MAX_COMBATANTS = 100;
export const MAX_COMBATANT_ID_LENGTH = 64;

/**
 * Validate the persisted "active combatant id" — the id of the combatant
 * whose turn it currently is in the Initiative tracker. Persisted as the
 * id rather than as a sort-list index so removing the active combatant
 * doesn't silently re-point the turn pointer to whoever sort-shifts into
 * that index.
 *
 * Returns `null` for the legitimate "no combatant active yet" state, the
 * cleaned string id for a valid stored id, or `undefined` for malformed
 * input. The `ShapeValidator` contract uses `undefined` as the rejection
 * sentinel specifically so this validator (`T = string | null`) can
 * return `null` as a real value without colliding with rejection.
 */
export function validateInitiativeActiveId(
  parsed: unknown,
): string | null | undefined {
  if (parsed === null) return null;
  if (
    typeof parsed === "string" &&
    parsed.length > 0 &&
    parsed.length <= MAX_COMBATANT_ID_LENGTH
  ) {
    return parsed;
  }
  return undefined;
}

function isPlainObject(x: unknown): x is Record<string, unknown> {
  return x !== null && typeof x === "object" && !Array.isArray(x);
}

/**
 * Mint a fresh, collision-resistant combatant id.
 *
 * Used both by the dedupe pass below and by the live add paths in
 * `InitiativeWidget`/`PartyWidget`. Those two widgets feed the SAME combat
 * list, so they must share one minter — a per-widget `Date.now()`-seeded
 * counter would produce overlapping id sequences and collide on a
 * same-millisecond mint across the Party→Initiative boundary (see the
 * `validateCombatants` doc comment). A random suffix removes that window.
 */
export function mintCombatantId(): string {
  return `c-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Validate a parsed-but-untrusted array as a `Combatant[]`.
 *
 * - Drops non-object elements outright (a string-array like
 *   `["goblin","orc"]` would otherwise produce synthetic empty rows).
 * - Coerces every numeric field through `Number.isFinite` so a
 *   `hp: "foo"` or `hp: NaN` becomes 0 rather than poisoning the
 *   HP +/- handlers (`Math.max(0, NaN+1) = NaN`).
 * - Generates a fresh random `id` when missing/malformed; existing valid
 *   ids are preserved.
 * - Renumbers DUPLICATE ids in a post-pass (mirrors `normalizePartyBatch`).
 *   Two combatants sharing an `id` — reachable via a hand-edited/hostile
 *   backup, a DevTools edit of `dm-initiative-v1`, or a same-millisecond
 *   mint across the Party→Initiative widget boundary — would otherwise
 *   render with identical React keys, and every per-row action
 *   (`updateHp`/`removeCombatant` keys on `c.id === id`) would hit BOTH
 *   rows: a single HP click or delete silently corrupts two combatants.
 * - Truncates to `MAX_COMBATANTS` to defend against pathological inputs.
 *
 * Returns `undefined` for anything that isn't an array (the only "totally
 * unrecoverable" case); otherwise returns a salvaged `Combatant[]` that
 * may be empty.
 */
export function validateCombatants(parsed: unknown): Combatant[] | undefined {
  if (!Array.isArray(parsed)) return undefined;
  const finiteNum = (v: unknown, def: number) =>
    typeof v === "number" && Number.isFinite(v) ? v : def;
  const normalized = parsed
    .slice(0, MAX_COMBATANTS)
    .filter(isPlainObject)
    .map((c) => {
      const o = c as Partial<Combatant>;
      return {
        id:
          typeof o.id === "string" && o.id.length > 0 && o.id.length <= 64
            ? o.id
            : mintCombatantId(),
        name: typeof o.name === "string" ? o.name.slice(0, 200) : "",
        initiative: finiteNum(o.initiative, 0),
        hp: finiteNum(o.hp, 0),
        maxHp: finiteNum(o.maxHp, 0),
        ac:
          typeof o.ac === "number" && Number.isFinite(o.ac) ? o.ac : undefined,
        isPlayer: typeof o.isPlayer === "boolean" ? o.isPlayer : false,
      };
    });
  // Dedupe pass: renumber any id collisions with fresh ids. The fresh-mint
  // loop guards against the (astronomically unlikely) case of a random id
  // colliding with one already in the set.
  const seen = new Set<string>();
  for (const combatant of normalized) {
    if (seen.has(combatant.id)) {
      let fresh = mintCombatantId();
      while (seen.has(fresh)) fresh = mintCombatantId();
      combatant.id = fresh;
    }
    seen.add(combatant.id);
  }
  return normalized;
}
