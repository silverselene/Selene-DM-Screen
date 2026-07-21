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
import { nameKey } from "@/lib/names";

export const MAX_COMBATANTS = 100;
export const MAX_COMBATANT_ID_LENGTH = 64;

// The versioned storage key backing the live combatant list. Exported so
// the Party widget's not-consumed fallback (PartyWidget.addToInitiative)
// reads and writes the exact key the Initiative widget's `useLocalStorage`
// call and the boot-time migrations use — a hardcoded copy in another
// file is how a future version bump would silently fork the two paths.
export const INITIATIVE_STORAGE_KEY = "dm-initiative-v1";

/** Append a combatant and re-sort descending by initiative — the ONE
 *  ordering rule for the tracker. Shared by the Initiative widget's add
 *  paths (forms + the `dm-add-to-initiative` handler) and the Party
 *  widget's direct-storage fallback, so a future tie-breaking change
 *  can't diverge between them. Pure: returns a new array. */
export function appendCombatant(list: Combatant[], c: Combatant): Combatant[] {
  return [...list, c].sort((a, b) => b.initiative - a.initiative);
}

/** User-facing refusal shown by every entry point that hits the
 *  MAX_COMBATANTS ceiling — kept here so the copy can't drift between
 *  the Initiative and Party widgets. */
export function initiativeFullMessage(): string {
  return `Initiative is full (max ${MAX_COMBATANTS} combatants). Remove some before adding more.`;
}

/**
 * The existing player combatant an incoming add would duplicate, or
 * undefined.
 *
 * Players ONLY: five goblins in one fight is routine, so a monster must never
 * warn — the confirm would fire on every repeat add and train the DM to click
 * through it. A monster sharing a player's name (a doppelganger) doesn't match
 * either; that's a deliberate DM move, not a mistake.
 *
 * The name match goes through the shared `nameKey` so this and the party
 * roster's "already in the party?" prompt can't drift apart on what "already
 * there" means.
 */
export function findDuplicatePlayer(
  list: Combatant[],
  incoming: Combatant,
): Combatant | undefined {
  if (!incoming.isPlayer) return undefined;
  const key = nameKey(incoming.name);
  return list.find((c) => c.isPlayer && nameKey(c.name) === key);
}

/** User-facing confirm shown by every entry point that would add a player
 *  already in the tracker — kept here, like initiativeFullMessage(), so the
 *  copy can't drift between the four add paths. Names the existing roll:
 *  that's what tells the DM whether this is a mis-click or a re-roll. */
export function duplicatePlayerMessage(existing: Combatant): string {
  return (
    `${existing.name} is already in initiative (rolled ${existing.initiative}). ` +
    `Add a second entry anyway?`
  );
}

/**
 * The default `confirmDuplicate` adapter: ask the DM via window.confirm.
 *
 * Lives next to the copy it renders so all four add paths share one wrapper —
 * swapping window.confirm for a styled dialog is then a one-line change here
 * rather than an edit at every call site.
 *
 * It stays an explicit, opt-in argument rather than a default parameter of
 * `decideInitiativeAdd`/`addCombatantToInitiative`: those two are the pure
 * decision layer, and a blocking modal must never be something a caller gets
 * by forgetting to pass an option.
 */
export function confirmDuplicateViaWindow(existing: Combatant): boolean {
  return window.confirm(duplicatePlayerMessage(existing));
}

/** What an add attempt did: appended, refused at the cap, or declined by the
 *  DM at the duplicate confirm. `addCombatantToInitiative` widens this with
 *  "error" for its storage-fallback path. */
export type AddOutcome = "added" | "full" | "cancelled";

/** Asked whether to add a player already in the tracker; handed the EXISTING
 *  combatant so the prompt can name its roll. `confirmDuplicateViaWindow` is
 *  the standard implementation. */
export type ConfirmDuplicate = (existing: Combatant) => boolean;

export interface AddToInitiativeOptions {
  /**
   * REQUIRED, though it accepts `undefined` — pass `confirmDuplicateViaWindow`
   * for the standard prompt, or an explicit `undefined` to add duplicates
   * silently.
   *
   * Required rather than optional because omitting it restores the exact bug
   * this guard exists to fix ("Add to Initiative silently added a duplicate
   * PC"), and a silently-off guard is not something a new call site should
   * inherit by forgetting a key. Written this way, forgetting is a compile
   * error and choosing silence is a visible decision at the call site.
   */
  confirmDuplicate: ConfirmDuplicate | undefined;
}

/**
 * The `dm-add-to-initiative` wire contract.
 *
 * `outcome` is an OUT param: the mounted Initiative widget writes its decision
 * here before `dispatchEvent()` returns, so the dispatcher learns what actually
 * happened to the combatant it handed over. Dispatch is synchronous, so the
 * value is readable immediately after the dispatch call.
 */
export interface AddToInitiativeDetail {
  combatant: Combatant;
  confirmDuplicate?: ConfirmDuplicate;
  outcome?: AddOutcome;
}

/**
 * Decide whether `incoming` may join `list` — the ONE place the add rules
 * live, so the tracker can't enforce a different rule depending on which of
 * the four add paths the DM used.
 *
 * Two callers, one per authority regime:
 *  - the mounted Initiative widget, against its in-memory list (the authority
 *    whenever the widget is mounted — its `useLocalStorage` state, not
 *    storage, is what the DM sees);
 *  - `addCombatantToInitiative`'s fallback, against localStorage (the
 *    authority only when no widget is mounted to consume the event).
 *
 * Pure apart from `confirmDuplicate`, which is injected precisely because it
 * is a blocking modal in production — the Node-env tests pass a stub and
 * assert on the returned decision.
 */
export function decideInitiativeAdd(
  list: Combatant[],
  incoming: Combatant,
  confirmDuplicate?: ConfirmDuplicate,
): AddOutcome {
  // Cap first: a full list refuses the add outright, so prompting about a
  // duplicate the DM cannot add anyway would be noise.
  if (list.length >= MAX_COMBATANTS) return "full";
  const existing = findDuplicatePlayer(list, incoming);
  if (existing && confirmDuplicate && !confirmDuplicate(existing)) {
    return "cancelled";
  }
  return "added";
}

/**
 * The consumer half of the `dm-add-to-initiative` contract, whose producer half
 * is `addCombatantToInitiative` below.
 *
 * Lives here rather than inline in InitiativeWidget's listener so the two halves
 * sit in one file and can be tested against EACH OTHER in the Node env — a
 * hand-written stub of this logic in the test would keep passing while the real
 * widget drifted away from it. The widget supplies `commit` (the only part that
 * needs React: reading its in-memory list and calling setCombatants) and this
 * owns the wire protocol:
 *
 *  - preventDefault() to signal consumption, so the producer doesn't ALSO write
 *    storage behind the widget's back;
 *  - write the decision to `detail.outcome`, so the producer can report a
 *    refused-at-cap or declined-at-confirm add to the DM instead of assuming
 *    "consumed" meant "added".
 *
 * Ignores an event with no combatant without consuming it — a malformed dispatch
 * shouldn't silently swallow the add.
 *
 * FIRST consumer wins. Nothing stops the DM from placing the Initiative widget
 * in two tiles (the widget picker doesn't filter already-placed types), and both
 * copies listen on `window`. Without the `defaultPrevented` bail every mounted
 * copy would commit the same combatant: the duplicate confirm would fire once
 * per tile, and the last listener's decision would overwrite `detail.outcome` —
 * so declining the first prompt and accepting the second would report "added"
 * while the first widget added nothing.
 *
 * preventDefault() goes AFTER the commit returns, not before. dispatchEvent
 * catches and reports a listener's exception rather than propagating it, and the
 * canceled flag survives — so consuming up-front would leave the producer with
 * `outcome: undefined` on a cancelled event, which its `?? "added"` reads as
 * success. Consuming only on a completed commit means a throw here falls through
 * to the producer's storage fallback instead of being reported to the DM as an
 * add that never happened.
 */
export function handleAddToInitiativeEvent(
  e: Event,
  commit: (combatant: Combatant, confirmDuplicate?: ConfirmDuplicate) => AddOutcome,
): void {
  if (e.defaultPrevented) return;
  const detail = (e as CustomEvent<AddToInitiativeDetail>).detail;
  if (!detail?.combatant) return;
  const outcome = commit(detail.combatant, detail.confirmDuplicate);
  detail.outcome = outcome;
  e.preventDefault();
}

// Initiative bounds. Wide (high-DEX + bonuses can exceed 20, penalties go
// negative) but still capped so a typo'd "2000" can't wreck the sort
// order. Shared by EVERY entry point that turns typed text into a
// combatant's initiative — the Initiative widget's three add forms AND
// the Party widget's per-row "Add to Initiative" — so no path can skip
// the clamp.
export const INIT_MIN = -99;
export const INIT_MAX = 999;

// HP / AC bounds, shared by the typed add forms (InitiativeWidget imports
// these) AND the read/import path (`validateCombatants` below) so a
// hand-edited or hostile stored value can't round-trip a number the typed
// paths would have rejected. HP is non-negative (the live tracker's
// updateHp already floors damage at 0); AC tops out where the party store's
// AC cap does. Kept here, next to INIT_MIN/INIT_MAX, as the one source of
// truth for combatant numeric bounds.
export const HP_MAX = 9999;
export const AC_MAX = 99;

/** A single d20 (1–20). Shared by every "roll initiative for me" entry point —
 *  the Initiative widget's add forms and the AI-chat cards — so the roll lives
 *  in one place rather than being re-implemented per widget. */
export function rollD20(): number {
  return Math.floor(Math.random() * 20) + 1;
}

/** Parse a typed initiative string and clamp it to [INIT_MIN, INIT_MAX].
 *  `<input type="number" min max>` attributes are only UI hints — typed
 *  or pasted text flows through unchecked. Unparseable input → 0. */
export function clampInitiative(raw: string): number {
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? Math.max(INIT_MIN, Math.min(INIT_MAX, n)) : 0;
}

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
  if (parsed.length > MAX_COMBATANTS) {
    // The slice below is a hostile-input defense, but it fires on ANY
    // oversized list — and on the read path the caller persists the
    // cleaned value, making the loss permanent. The live add paths
    // refuse at MAX_COMBATANTS so legitimate state should never get
    // here; warn loudly in case one slips through so the loss is at
    // least diagnosable.
    console.warn(
      `validateCombatants: dropping ${parsed.length - MAX_COMBATANTS} combatants beyond the ${MAX_COMBATANTS} cap`,
    );
  }
  // Coerce a non-finite value to `def`, then clamp into [min, max] — so a
  // hand-edited/hostile `initiative: 1e308` or `hp: -5e12` lands in the same
  // range the typed add paths enforce (clampInitiative, the widget's
  // HP/AC caps) instead of round-tripping unbounded through import.
  const clampNum = (v: unknown, min: number, max: number, def: number) => {
    const n = typeof v === "number" && Number.isFinite(v) ? v : def;
    return Math.max(min, Math.min(max, n));
  };
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
        initiative: clampNum(o.initiative, INIT_MIN, INIT_MAX, 0),
        hp: clampNum(o.hp, 0, HP_MAX, 0),
        maxHp: clampNum(o.maxHp, 0, HP_MAX, 0),
        ac:
          typeof o.ac === "number" && Number.isFinite(o.ac)
            ? Math.max(0, Math.min(AC_MAX, o.ac))
            : undefined,
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

/**
 * Add a combatant to the live Initiative tracker, shared by every non-Initiative
 * entry point (the Party widget's per-row add and the AI-chat cards).
 *
 * Asks the AUTHORITY, in order:
 *
 *  1. Dispatch the cancelable `dm-add-to-initiative` event. A mounted Initiative
 *     widget consumes it via preventDefault(), applies `decideInitiativeAdd` to
 *     its in-memory list, and writes the result back to `detail.outcome`. Its
 *     list — not storage — is what the DM is looking at, so when it answers, its
 *     answer is final and storage is never consulted.
 *  2. Nothing consumed it (no Initiative tile placed, or its lazy chunk hasn't
 *     mounted) → storage IS the authority. Read it, decide against it, and write
 *     directly so the combatant appears when the widget mounts.
 *
 * Deciding after the dispatch rather than before it is load-bearing. Deciding
 * against storage first would consult the wrong list whenever the two can
 * legitimately diverge — e.g. the widget seeded from `legacyInitialValue`
 * because the boot migration's setItem hit quota, leaving `dm-initiative-v1`
 * empty while the DM plainly sees combatants on screen — and would skip the
 * checks entirely on an unreadable read while the add still succeeded via the
 * event.
 *
 * Returns "full" at the MAX_COMBATANTS cap (caller alerts with
 * initiativeFullMessage()), "cancelled" when the DM declines the duplicate
 * confirm, "error" when the fallback can't read/write storage, else "added".
 *
 * `opts.confirmDuplicate` is called only when `combatant` is a player already in
 * the tracker. It is required (see `AddToInitiativeOptions`): pass
 * `confirmDuplicateViaWindow` for the standard prompt, or an explicit
 * `undefined` to add duplicates silently.
 */
export function addCombatantToInitiative(
  combatant: Combatant,
  opts: AddToInitiativeOptions,
): AddOutcome | "error" {
  const detail: AddToInitiativeDetail = {
    combatant,
    confirmDuplicate: opts.confirmDuplicate,
  };
  const consumed = !window.dispatchEvent(
    new CustomEvent("dm-add-to-initiative", { detail, cancelable: true }),
  );
  // A consumer that cancels the event but writes no outcome predates this
  // contract (or is some other listener); "consumed" has always meant "added".
  if (consumed) return detail.outcome ?? "added";

  let stored: Combatant[];
  try {
    const raw = window.localStorage.getItem(INITIATIVE_STORAGE_KEY);
    stored = validateCombatants(raw ? JSON.parse(raw) : []) ?? [];
  } catch {
    // Unreadable list and no widget to ask: there is no authority to decide
    // against, so refuse rather than append to a list we can't see.
    return "error";
  }

  const decision = decideInitiativeAdd(stored, combatant, opts.confirmDuplicate);
  if (decision !== "added") return decision;

  try {
    window.localStorage.setItem(
      INITIATIVE_STORAGE_KEY,
      JSON.stringify(appendCombatant(stored, combatant)),
    );
    return "added";
  } catch {
    return "error";
  }
}
