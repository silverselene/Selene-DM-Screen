# Duplicate-PC warning on Initiative adds

**Date:** 2026-07-15
**Branch:** `feat/ai-chat-bridge`
**Status:** implemented

> **Amended 2026-07-15 during implementation.** The originally approved
> "status + force re-call" shape could not work: `addCombatantToInitiative`
> returns a string union, so the caller never received the *existing*
> combatant — and `duplicatePlayerMessage` needs it to name the roll. The
> Party and Chat call sites don't hold the combat list, which is precisely why
> they go through that function. Replaced with an injected confirm callback
> (the brainstorm's option B). Sections below describe the shipped design.

## Problem

Adding a player character to the Initiative tracker never warns when that
character is already in the list. Found during manual-test item C11: adding a
character from an AI Chat card to the **Party** correctly opened the
Replace / Add-as-new collision review, but **Add to Initiative** silently
appended a second row for a PC already in combat.

Five paths add a combatant today and none check for duplicates:

| Path | File |
|---|---|
| `addPlayer` (manual form) | `InitiativeWidget.tsx` |
| `addMonster` | `InitiativeWidget.tsx` |
| `addFromParty` | `InitiativeWidget.tsx` |
| `addToInitiative` (per-row button) | `PartyWidget.tsx` |
| `addToInitiative` (chat card) | `ChatCardActions.tsx` |

Duplicate **monsters** are routine — five goblins in one fight. Duplicate
**PCs** essentially never are. The warning is therefore scoped to players.

## Decisions

1. **Confirm, don't block.** A duplicate PC add raises a confirm naming the
   clash; Cancel is the safe default, OK adds the second row. A hard block
   would strand a DM who genuinely wants a duplicate (a clone, a summon, two
   PCs sharing a name).
2. **PC vs existing PC only.** The check fires only when the incoming
   combatant is `isPlayer: true` *and* an existing `isPlayer: true` combatant
   shares its name. A monster sharing a PC's name (a doppelganger) does not
   warn — that is a deliberate DM move.
3. **Injected confirm callback.** `addCombatantToInitiative` takes a
   `confirmDuplicate` callback and returns `"cancelled"` when the DM declines.
   The *caller's* callback owns `window.confirm`, so `combatant.ts` stays free
   of DOM calls — which matters because the Tier-1 tests run in a Node
   environment with no jsdom — and the tests inject a stub instead. The shared
   copy still lives in the lib, mirroring the `initiativeFullMessage()` idiom.

## Design

### New in `artifacts/dm-screen/src/lib/combatant.ts`

```ts
/** The existing player combatant an incoming add would duplicate, or
 *  undefined. Players only: duplicate monsters are routine (five goblins),
 *  duplicate PCs essentially never are. Name match mirrors partyStore's
 *  roster-collision rule (trim + lowercase) so the two prompts agree on
 *  what "already there" means. */
export function findDuplicatePlayer(
  list: Combatant[],
  incoming: Combatant,
): Combatant | undefined;

/** Shared copy for the duplicate confirm — kept here, like
 *  initiativeFullMessage(), so it can't drift between the four entry points. */
export function duplicatePlayerMessage(existing: Combatant): string;
```

`findDuplicatePlayer` returns `undefined` unless `incoming.isPlayer` is true
and some `c` in `list` satisfies `c.isPlayer` and
`c.name.trim().toLowerCase() === incoming.name.trim().toLowerCase()`.

`duplicatePlayerMessage` names the clash and its current roll:

> Aragorn is already in initiative (rolled 18). Add a second entry anyway?

The existing roll is what tells the DM whether this is a mistake or a re-roll.

### Changed: `addCombatantToInitiative`

```ts
export function addCombatantToInitiative(
  combatant: Combatant,
  opts?: { confirmDuplicate?: (existing: Combatant) => boolean },
): "added" | "full" | "error" | "cancelled";
```

`confirmDuplicate` fires only when `combatant` is a player already in the list,
and receives the **existing** combatant so the prompt can name its roll.
Returning `false` aborts the add with `"cancelled"` and writes nothing. Omitting
the callback preserves the old behaviour (duplicates added silently), so no
existing caller changes meaning.

The check sits **after** the storage read and **after** the cap check:

- After the read, so an unreadable list falls through to `"error"` rather than
  silently skipping the check.
- After the cap check, so `"full"` outranks the confirm. A full list refuses the
  add outright; prompting about a duplicate the DM cannot add anyway would be
  noise. A test pins this ordering by asserting the callback is never invoked at
  the cap.

### Call-site changes

| Path | Change |
|---|---|
| `PartyWidget.addToInitiative` | passes `confirmDuplicate`; `"cancelled"` leaves the form open with the typed initiative intact |
| `ChatCardActions.addToInitiative` | passes `confirmDuplicate` for both card kinds — monster cards are `isPlayer: false`, which `findDuplicatePlayer` ignores, so one code path covers both; `"cancelled"` shows no flash |
| `InitiativeWidget.addFromParty` | `duplicatePlayerRefused(newC)` → confirm inline (list already in scope) |
| `InitiativeWidget.addPlayer` | same; no `isPlayer` guard needed — `findDuplicatePlayer` ignores a non-player draft |
| `InitiativeWidget.addMonster` | untouched |

`PartyWidget` and `ChatCardActions` go through `addCombatantToInitiative`
because they do not hold the combat list. The `InitiativeWidget` forms hold
`combatants` in scope, so they share a local `duplicatePlayerRefused` helper —
companion to the existing `combatListFull()` — rather than re-reading storage.

### Deliberate exclusion

The `dm-add-to-initiative` listener in `InitiativeWidget` gets **no** check. It
is the consumer side of an add the dispatcher has already validated and
confirmed; re-checking there would double-prompt. Approved 2026-07-15.

### Resolved: the re-read race

The originally specced `force` re-call would have re-read storage, leaving a
(negligible) window for the list to change between calls. The callback shape
removes the second call entirely, so the race no longer exists.

## Error handling

- `"duplicate"` is evaluated only after the storage read succeeds. An
  unreadable list falls through to the existing `"error"` path rather than
  silently skipping the check.
- Cancelling leaves state completely untouched — no form reset, no
  `setInitiativeFor(null)`, no cleared initiative field — so a mis-click does
  not cost the DM their typed initiative value.

## Testing

Tier-1 unit tests extend `artifacts/dm-screen/src/lib/combatant.test.ts`, which
already covers `addCombatantToInitiative` via its `installWindow` fake-storage
helper.

`findDuplicatePlayer`:
- matches an existing PC by name, case- and whitespace-insensitively
- returns `undefined` when the incoming combatant is a monster
- returns `undefined` when the only name match is a monster (PC vs monster)
- returns `undefined` on an empty list / no match
- returns the *first* matching PC when several share a name

`addCombatantToInitiative` (confirm stubbed, no DOM):
- returns `"cancelled"` and writes nothing when the confirm declines
- adds the duplicate when the confirm accepts
- hands the callback the *existing* combatant, so the prompt can name its roll
- adds silently when no `confirmDuplicate` is supplied (back-compat)
- returns `"full"` without invoking the callback at the cap (ordering)
- never invokes the callback for a monster

The four call sites are widget code with no DOM test coverage, so they remain
manual — checklist item 11 in `MANUAL-TESTS-post-rebase.md`, which should be
extended to cover the duplicate confirm from each of the four paths and the
"monsters still don't warn" case.

## Out of scope

- Re-roll / update-in-place on collision (rejected in favour of the confirm).
- Any duplicate handling for monsters.
- A rich per-field review form like the party collision — an initiative
  combatant is only name/initiative/HP/AC, which does not warrant it.
