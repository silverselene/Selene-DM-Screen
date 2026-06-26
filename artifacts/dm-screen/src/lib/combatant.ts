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

function isPlainObject(x: unknown): x is Record<string, unknown> {
  return x !== null && typeof x === "object" && !Array.isArray(x);
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
 * - Truncates to `MAX_COMBATANTS` to defend against pathological inputs.
 *
 * Returns `null` for anything that isn't an array (the only "totally
 * unrecoverable" case); otherwise returns a salvaged `Combatant[]` that
 * may be empty.
 */
export function validateCombatants(parsed: unknown): Combatant[] | null {
  if (!Array.isArray(parsed)) return null;
  const finiteNum = (v: unknown, def: number) =>
    typeof v === "number" && Number.isFinite(v) ? v : def;
  return parsed
    .slice(0, MAX_COMBATANTS)
    .filter(isPlainObject)
    .map((c) => {
      const o = c as Partial<Combatant>;
      return {
        id:
          typeof o.id === "string" && o.id.length > 0 && o.id.length <= 64
            ? o.id
            : `c-${Math.random().toString(36).slice(2, 10)}`,
        name: typeof o.name === "string" ? o.name.slice(0, 200) : "",
        initiative: finiteNum(o.initiative, 0),
        hp: finiteNum(o.hp, 0),
        maxHp: finiteNum(o.maxHp, 0),
        ac:
          typeof o.ac === "number" && Number.isFinite(o.ac) ? o.ac : undefined,
        isPlayer: typeof o.isPlayer === "boolean" ? o.isPlayer : false,
      };
    });
}
