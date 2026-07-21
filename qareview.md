# QA Review — Full Codebase

Date: 2026-07-18
Method: sequential deep-read subagent review, one subsystem at a time.
Scope: entire repository at master (eb06210), not a diff.

Severity scale: **P0** data loss / crash · **P1** functional bug · **P2** edge case / robustness · **P3** code quality / nit

## Status

- [x] 1. `artifacts/dm-screen/src/lib/` — stores, backup/restore, migrations
- [x] 2. `artifacts/dm-screen/src/components/widgets/` — the nine widgets
- [x] 3. `scripts/src/data-generators/` — offline generators
- [x] 4. `services/ai-bridge/` — optional AI bridge
- [x] 5. Config/infra — vite/PWA/Docker/nginx

## Executive summary

**38 findings: 0 P0 · 2 P1 · 11 P2 · 25 P3** (the duplicate-tile clobber was found independently by agents 1 and 2 and is counted once). No data-loss or crash bugs in shipped code paths; overall the codebase's hardest surfaces (backup atomicity, the add-to-initiative event contract, the bridge's localhost security) reviewed as genuinely robust.

**Progress: 17 fixed (2 P1s + all 7 §1 findings + all 8 §2 findings) · 21 open** — see the remediation log below.

**Fix-first shortlist:**
1. ~~**[P1] `{@recharge N}` stripping**~~ **FIXED** — see §3; regen also caught up the committed data with d1d13e8's cross-source gate.
2. ~~**[P1] Duplicate feat ids**~~ **FIXED** — see §3; dedupe now keyed on the slug the ids are minted from.
3. ~~**[P2] Duplicate stateful tiles clobber localStorage**~~ **FIXED** — the broader §2 case is now closed: all stateful widgets are singletons via the shared `SingletonGate` (see §2 remediation log).
4. **[P2] claude-code-review.yml has no author gate** — drive-by PRs on a public repo burn subscription spend and open a prompt-injection surface (§5).
5. **[P2] `.dockerignore` secret patterns are root-anchored** — a nested `services/ai-bridge/.env` would enter build layers; latent today (§5).
6. **[P2] CI never runs `pnpm build`** — the 8 MiB precache cap, define assertions, and bundle scans don't gate merges (§5).

**Recurring themes:** validators on the backup-import path are systematically weaker than the equivalent typed-input paths (§1 ×3, §2 Portal URL); the generators are entirely untested despite being the highest-regression-risk code (§3 — *partially addressed, see log*); dm-screen's config files and tests have zero typecheck coverage while the bridge's do (§5).

## Remediation log

### 2026-07-21 — all 8 §2 (`src/components/widgets/`) findings fixed

Every finding under §2 — the 1 P2 and 7 P3s — is resolved. Details inline at each finding heading; summary:

- **[P2] Duplicate stateful tiles clobber** — resolved by the maintainer's choice to "singleton all stateful": Notepad, Oracle, Bestiary, Compendium, Wizard's Tome, and Portal join AI Chat + Initiative in `SINGLETON_WIDGET_TYPES` (`types.ts`). A new reusable `SingletonGate` (`src/lib/SingletonGate.tsx`) wraps each widget's stateful body (thin export → gated `…Body`), collapsing the mount-guard boilerplate Initiative/AI Chat had each inlined. Party stays exempt (partyStore's `dm-party-changed` already syncs same-tab). The selector-disable and both `App.tsx` add-path guards are already generic over the set, so no changes there. Because these widgets share one storage key, a second tile never showed independent state anyway — the guard loses no real capability.
- **[P3] Heal has no upper clamp** — `updateHp` now caps a heal at `Math.max(c.maxHp, c.hp)` (never below current, in case stored hp already exceeds maxHp); damage still floors at 0.
- **[P3] Compendium/Tome uncapped filtered lists** — both now cap the filtered render at `MAX_RESULTS = 200` with a "showing first 200 of N — refine your search" footer (mirrors Bestiary). Compendium additionally gained a precomputed lowercase `SEARCH_INDEX` + `useDeferredValue` (the Tome already had both), so a keystroke no longer re-lowercases every entry's full content.
- **[P3] Firefox drag never starts** — the grip's `onDragStart` now calls `e.dataTransfer.setData("text/plain", "")` (payload unused; reorder is React-state-driven), which Firefox requires to initiate an HTML5 drag.
- **[P3] Portal link no scheme check** — "Open in new tab" is rendered as a real anchor only when the saved value is an `http(s):` URL (`externalHref` guard), so a restored/hand-edited hostile `javascript:`/`data:` backup value can never reach an href.
- **[P3] Tag-input refocus / dead loading** — both `WeaponTagInput` and `SpellTagInput` reopen cached matches on refocus (`onFocus` → `setOpen(true)` when a query + suggestions exist); the never-rendering `loading` state (and its now-unused `Search` import) were removed.
- **[P3] "Ask Selene instead" silent no-op while streaming** — the escalate link is now `disabled` (with a "wait for the current answer" title) while a turn streams; `sending` threads through `MessageRow` as a primitive so the memo stays intact (flips twice per turn, not per chunk).
- **[P3] Icon-only controls missing names** — the empty tile's "+" add button and Party's edit-pencil button gained `title` + `aria-label`.

**Test coverage added (27 new tests across 8 files).** Two P3 fixes were extracted to pure helpers for cheap tier-1 coverage; the rest are tier-2 jsdom component tests that mock the heavy data modules (monsters.ts 4.7 MB, spells.ts 590 kB, compendiumRules.ts 660 kB) with small synthetic sets:
- `combatant.test.ts` — `applyHpDelta` extracted from `updateHp` (heal caps at maxHp, never below current, damage floors at 0). +6.
- `portalEmbed.test.ts` — `toExternalHref` extracted from the inline scheme guard (http(s) pass-through; `javascript:`/`data:`/protocol-relative rejected). +3.
- `ChatLocalAnswer.test.tsx` — escalate link shown/hidden + **disabled while streaming** (the busy guard) + hidden for usage hints. +4.
- `CompendiumWidget.test.tsx` / `WizardsTomeWidget.test.tsx` — 7-row unfiltered preview + 200-row filtered cap + footer + case-insensitive index. +7.
- `PartyWidget.tagInput.test.tsx` — weapon tag-input reopens cached suggestions on refocus after an outside-click dismiss (SpellTagInput mirrors it). +1.
- `BestiaryWidget.targetConsumption.test.tsx` — `dm-open-bestiary` target → detail view on a match, name-search fallback on a miss, signal cleared either way. +2.
- `AIChatWidget.banner.test.tsx` — degraded-mode banner: offline vs. origin-blocked (403) vs. online, plus the banner-transition gap (successful Retry clears it). +4.
- `SingletonGate.test.tsx` — the shared gate (owner/duplicate/handoff/single-mount + set membership). +4.

**Verified:** 351/351 dm-screen tests · `pnpm typecheck` clean · `pnpm build` + verify-precache pass.

**Still open (§2 coverage gaps):** AI Chat *streaming* internals (SSE-mock heavy) and full escalation-reset; Oracle functional tests; DMTile/App drag-reorder + corner-resize *geometry* (jsdom has no layout); Party import at the *widget* tier (file-picker-blocked — the pure two-phase logic is covered in `partyStore.test.ts`). The Firefox `setData` and AnchoredDropdown-flip items remain browser/Playwright-only. No logic findings remain — these are coverage-depth, not defects.

### 2026-07-21 — §1 `tilesLayoutConsistent` hardened: two spans overlapping on a shared `null` cell

Follow-up review of the 2026-07-20 `tilesLayoutConsistent` fix found a residual overlap it couldn't see. The per-cell check `tiles[idx] !== null` rejects a span whose footprint lands on a *real* tile, but two spans can both legitimately require the *same* `null` placeholder — a `colSpan:2` tile and a `rowSpan:2` tile whose footprints cross on one empty cell. Each span's per-cell check passes (the cell genuinely is `null` for both), so the layout was accepted and rendered overlapping. The double-claim only shows up as a cell marked `covered` twice, so the guard now rejects on an already-`covered` cell (`backup.ts`, footprint loop). New regression test in `backup.test.ts` ("rejects two spans that overlap on a shared null cell") — a 3×3 grid with a `1×2` at index 1 and a `2×1` at index 3 both claiming cell 4; confirmed the test fails against the pre-fix source and passes after. Not a new finding — closes a gap in the already-"fixed" §1 tile-consistency P3.

**Verified:** 320/320 dm-screen tests · `pnpm typecheck` clean.

### 2026-07-21 — §1 `src/lib/` coverage gaps closed (tests only, no source changes)

Three new test files, test-first against existing behavior, matching the tier-1/tier-2 convention (36 new tests):

- **`src/hooks/useLocalStorage.test.tsx`** (tier-2 jsdom, 20 tests) — the headline remaining §1 gap. Covers heal-on-read write-back (cleaned-value persist, no-rewrite-when-clean, in-memory value preserved when the heal write throws), the full debounce timer/flush interplay (deferred write, coalescing, and flush on unmount / `pagehide` / tab-hidden / `pendingWrites` registry sweep — the exact path `backup.ts` takes), and the `onWriteError`→`onWriteSuccess` recovery edge (fires only on the failure→success transition, once).
- **`src/lib/envelope.test.ts`** (tier-1 node, 10 tests) — schema/version gating and the cross-surface "wrong file, load it here" hints, pinned on the shared module directly rather than only through the two importers.
- **`src/lib/pendingWrites.test.ts`** (tier-1 node, 6 tests) — register→flush→unregister registry contract in isolation.

**Verified:** 319/319 dm-screen tests · `pnpm typecheck` clean. tsconfig `exclude` uses global `**/*.test.ts(x)` globs, so the new `src/hooks/` test location does not leak into `pnpm build`.

**Still open (§1):** only the two jsdom-structurally-blocked items — `AnchoredDropdown` flip placement and `promptForJsonFile` dismissal — remain, and closing them is a Playwright decision, not a logic gap.

### 2026-07-20 — all 7 §1 (`src/lib/`) findings fixed

Every finding under §1 — the 2 P2s and 5 P3s — is resolved, TDD (failing test first) for each. Details are inline at each finding heading above; summary:

- **[P2] Party id saturation** — `isAcceptableId` gate (positive safe int ≤ 2^50) in `normalize()` + renumber retry loop in `normalizePartyBatch`.
- **[P2] Two Initiative tiles clobber** — `"initiative"` is now a `SINGLETON_WIDGET_TYPES` member with a `useSingletonSlot` mount guard (`InitiativeWidget` → thin wrapper + `InitiativeSession`), mirroring AI Chat.
- **[P3] `migrateTurnIndexToActiveId`** — persists the validated list before writing the active-id pointer.
- **[P3] Backup pre-parse size gate** — `prepareImport` throws on an oversized file before `JSON.parse`.
- **[P3] Empty-query monster browse** — sort before slice; module's first test file added.
- **[P3] Tile footprint consistency** — new `tilesLayoutConsistent(tiles, cols, rows)`, wired into both the import-path grid-triple eviction and App's read-path repack.
- **[P3] `validateCombatants` clamping** — `HP_MAX`/`AC_MAX` centralized in `combatant.ts`; initiative/hp/maxHp/ac clamped to the same bounds the typed paths use.

**Coverage gaps from §1 closed:** `monsterSearch.ts` now has a test file (ranking, empty-query, `findRichMonster`); `normalizePartyBatch` has hostile-id tests (≥ 2^53, negative, non-integer); `migrateTurnIndexToActiveId` has an id-less-legacy-shape test.

**Verified:** 276/276 dm-screen tests · `pnpm typecheck` clean · `pnpm build` + verify-precache pass · bundle scans clean (`/api/` and `bridge-protocol` zero hits).

### 2026-07-18 — both P1s fixed (single commit)

**§3 P1 `{@recharge N}` stripping — FIXED.** Dedicated rule in `stripTags` (`scripts/src/data-generators/lib.ts`) ahead of the zero-arg/generic passes: `{@recharge 5}` → `(Recharge 5–6)`, `{@recharge 6}`/bare → `(Recharge 6)`, matching the 5etools renderer (the old bare-form mapping `(Recharge)` was itself lossy and is gone). TDD: tests in `lib.test.ts` reproduced "Fire Breath 5" before the fix.

**§3 P1 duplicate feat ids — FIXED.** `dedupeByName` now keys on `slugify(name)` — the same normalization ids are minted from, so anything the slug collapses must dedupe. Helpers extracted from `generate-compendium.ts` (which runs `main()` at import, untestable) into side-effect-free `dedupe.ts`; TDD via `dedupe.test.ts`.

**Datasets regenerated** (`../open5e-api` re-cloned at v1.12.0 — it had been deleted, which is also why agent 3 couldn't re-run these generators):
- `compendiumRules.ts`: surgical — exactly the two TCE duplicates removed (564 → 562, XPHB versions survive, zero duplicate ids remain).
- `monsters.ts`: 0 bare-number action names remain (was 96). The regen also baked in d1d13e8's cross-source gate for the first time — committed data had drifted behind the generator (the exact "no regen-reproducibility check" gap flagged in §3): ~30 A5e/Kobold-Press rows swapped wrongly-attached same-name WotC blocks for own-book Open5e blocks or went thin on CR/type disagreement; rich count 2,146 → 2,144. Note this *narrows but does not close* the related open P2 ("canonical pass bypasses the cross-source gate") — CANONICAL_RICH_NAMES attachments still skip the gate.
- `spells.ts` / `weapons.ts`: byte-identical.

**Test infra added:** vitest wired into `scripts/` (`vitest.config.ts`, test scripts, tsconfig test-exclude per CLAUDE.md convention) — the generators' first tests (10 total). §3's "no tests for the generators" coverage gap is now *partially* addressed: `stripTags` recharge forms and the dedupe/slug invariant are pinned; `parseCSV`, `resolveFiveToolsKey`, and the gating logic remain untested.

**Docs:** CLAUDE.md counts updated (2,144 rich / 16 thin; compendium rules 562).

**Verified:** 345/345 tests · `pnpm typecheck` clean · `pnpm build` + verify-precache pass · bundle scans clean (`/api/` and `bridge-protocol` zero hits).

**Still open:** all 11 P2s and 25 P3s. Suggested next: the duplicate-tile localStorage clobber (§1/§2) or the CI/workflow gaps (§5 — author gate on claude-code-review.yml, `pnpm build` in CI).

---

## 1. `src/lib/` — stores, backup/restore, migrations

### ~~[P2]~~ **FIXED** — Party id minting saturates above 2^53 — permanent duplicate-id corruption from one crafted import
> **Fixed 2026-07-20:** `normalize()` now gates existing ids through `isAcceptableId` (positive safe integer `≤ 2^50`); anything outside the range is re-minted like a missing id, so the mint counter can never be bumped near float-saturation. `normalizePartyBatch`'s renumber pass gained the `while (seen.has(fresh))` retry loop (mirrors `validateCombatants`). Tests in `partyStore.test.ts` ("hostile party ids"): `1e300` duplicates renumber to distinct safe ints, live adds after a saturating import stay distinct, and negative/non-integer ids are re-minted.
`artifacts/dm-screen/src/lib/partyStore.ts:41-45, 111-114, 157-165`
`normalize()` accepts any finite number as an id (line 111) and `bumpIdCounter` (line 37) raises the module counter to it; beyond `Number.MAX_SAFE_INTEGER`, `++idCounter` in `mintId()` (line 44) is a no-op, so every subsequent mint returns the same value. Reproduced: a party file with two PCs both `id: 1e300` passes the "renumber duplicates" pass with the ids **still duplicated** (the renumber loop, unlike `combatant.ts:339-341`, has no `while (seen.has(fresh))` retry), and every later live `addCharacter` mints `1e300` again — colliding with the existing row, after which `updateCharacter`/`deleteCharacter` (`c.id !== id`, lines 217/230) silently hit multiple PCs, forever. Reachable via `preparePartyImport` and the full-backup `validateParty` path. Fix: reject/re-mint ids that aren't safe positive integers in `normalize()`, and add the uniqueness-retry loop to `normalizePartyBatch`.

### ~~[P2]~~ **FIXED** — Two Initiative tiles silently clobber each other's combat state
> **Fixed 2026-07-20:** `"initiative"` added to `SINGLETON_WIDGET_TYPES` (`src/types.ts`), and `InitiativeWidget` split into a thin export that runs `useSingletonSlot(INITIATIVE_MOUNT_SLOT)` — rendering the real `InitiativeSession` only for the slot owner, a placeholder for any duplicate — exactly mirroring `AIChatWidget`. The selector/recent-widgets guards in `App.tsx` and `WidgetSelectorModal` are already generic over the set, so no changes there. New component test `InitiativeWidget.singleton.test.tsx` mounts the real widget twice and asserts one live tracker + one placeholder, plus slot handoff on unmount. (Scoped to the §1 Initiative finding; the broader "any duplicated stateful widget" case in §2 stays open for Notepad/Bestiary/etc.)
`artifacts/dm-screen/src/hooks/useLocalStorage.ts:43-198` (no same-tab sync), `artifacts/dm-screen/src/lib/combatant.ts:179-186`, `artifacts/dm-screen/src/App.tsx:236` (only `SINGLETON_WIDGET_TYPES = {"ai-chat"}` is refused, `src/types.ts:34`)
The selector allows a second Initiative tile (only `ai-chat` is singleton), and `combatant.ts`'s own doc admits this. Each mounted copy holds an independent `useLocalStorage` snapshot of `dm-initiative-v1` and writes the whole list; there is no same-tab change event for this key (unlike `dm-party-changed`). Scenario: DM places Initiative twice, adjusts HP in tile A (full-list write), then clicks anything list-mutating in tile B — B writes its stale list and A's mid-encounter HP/turn changes are silently lost. Only the `dm-add-to-initiative` event path is guarded (first-consumer-wins). Fix: add Initiative to `SINGLETON_WIDGET_TYPES` + the `useSingletonSlot` guard, or broadcast a `dm-initiative-changed` event.

### ~~[P3]~~ **FIXED** — `migrateTurnIndexToActiveId` mints the active-id from a validated list it never persists
> **Fixed 2026-07-20:** the migration now `setItem("dm-initiative-v1", JSON.stringify(validated))` **before** writing the active-id pointer, so the ids the pointer references are the ones the widget's read path will see (validation no longer mints a fresh, divergent set on next load). New test in `migrations.test.ts` seeds an id-less legacy list and asserts the persisted combatant the pointer resolves to is the correct one.
`artifacts/dm-screen/src/lib/migrations.ts:85-94`
The migration runs `validateCombatants` (which mints fresh random ids for missing/non-string/duplicate ids) and writes `sorted[idx].id` to `dm-initiative-active-id-v1` — but leaves `dm-initiative-v1` unmodified. The widget's read path later re-validates the raw value and mints *different* ids (`useLocalStorage` heal, `InitiativeWidget.tsx:131-135`), so for any legacy/hand-edited list with id-less or duplicate-id combatants the pointer dangles and the reconciliation effect (`InitiativeWidget.tsx:203`) resets it to null — the migration silently fails at its one job. Normal v1 data (valid `c-…` string ids) is unaffected. Fix: `setItem("dm-initiative-v1", JSON.stringify(validated))` before writing the pointer.

### ~~[P3]~~ **FIXED** — Full-backup import has no pre-parse file-size gate
> **Fixed 2026-07-20:** `prepareImport` now checks `text.length > MAX_IMPORT_FILE_CHARS` (8× `MAX_TOTAL_BYTES`) and throws **before** `parseEnvelope`/`JSON.parse`, mirroring the party importer's `MAX_IMPORT_FILE_CHARS` gate. Test in `backup.test.ts` feeds a syntactically-valid but oversized envelope and asserts it throws `/too large/i`.
`artifacts/dm-screen/src/lib/backup.ts:610-612, 135-143`
`prepareImport(text)` feeds the entire file to `JSON.parse` before any cap; all hard caps (`MAX_KEYS`, `MAX_RAW_VALUE_BYTES`, `MAX_TOTAL_BYTES`) run post-parse. The party importer explicitly gates at 2 MB *before* parse for exactly this reason (`partyStore.ts:280-286`, "would otherwise hang or OOM the tab") — a mistakenly-picked multi-hundred-MB file hangs the tab here. Fix: mirror the `MAX_IMPORT_FILE_CHARS`-style check at the top of `prepareImport`.

### ~~[P3]~~ **FIXED** — Empty-query monster browse slices before sorting — correct only by generator accident
> **Fixed 2026-07-20:** the empty-query path now `.map(toHit).sort(localeCompare).slice(0, limit)` (sort **before** slice) so the alphabetically-first `limit` rich monsters win regardless of dataset emit order. New file `monsterSearch.test.ts` (the module's first tests, closing the §1 coverage gap) mocks a deliberately non-alphabetical dataset and asserts the browse returns the alphabetically-first rows; it also pins the prefix>substring>rich>alpha ranking and `findRichMonster`.
`artifacts/dm-screen/src/lib/monsterSearch.ts:68-72`
`monsters.filter(rich).slice(0, limit)` takes the first 60 in *dataset order*, then sorts them. This currently returns the right rows only because `generate-monsters.ts:1061` emits the array pre-sorted by `localeCompare`; any future regen that changes emit order (e.g. source-grouped) silently turns the Bestiary's default list into an arbitrary subset presented as alphabetical. Sort (or trust dataset order and drop the sort) before slicing.

### ~~[P3]~~ **FIXED** — `validateTiles` doesn't check span/placeholder consistency; App's repack heal only fires on length mismatch
> **Fixed 2026-07-20:** new exported pure fn `tilesLayoutConsistent(tiles, cols, rows)` in `backup.ts` verifies every non-null span stays in bounds and covers only `null` placeholders, and every `null` is covered by exactly one earlier span. The import path's grid-triple cross-field check now evicts the triple when the layout is inconsistent (not just on length mismatch), and App's `gridTiles` memo repacks whenever the layout is inconsistent (`repackTiles` already emits a consistent layout, so no re-render loop). Tests in `backup.test.ts` cover: valid spanned layout kept, missing-placeholder overlap evicted, out-of-bounds span evicted (and the old all-null "consistent" fixture updated to real empty tiles, which is what live data looks like).
> **Hardened 2026-07-21:** the first cut accepted two spans that overlap on a shared `null` cell (`tiles[idx] !== null` passes for both) — now rejects on an already-`covered` cell. See the remediation-log entry above.
`artifacts/dm-screen/src/lib/backup.ts:226-243`, `artifacts/dm-screen/src/App.tsx:178-185`
A hand-crafted backup with `tiles.length === cols*rows` but a `colSpan: 2` tile lacking its `null` placeholder passes both the per-key validator and the grid-triple consistency check (which compares only lengths, `backup.ts:522`); App's `repackTiles` reconciliation is skipped because the length matches, so the grid renders overlapping/overflowing tiles until manually re-laid-out. Not a crash (no widget math depends on it), but the one tiles invariant CLAUDE.md calls "easy to break" is unvalidated on import.

### ~~[P3]~~ **FIXED** — `validateCombatants` leaves numeric fields unclamped
> **Fixed 2026-07-20:** `HP_MAX`/`AC_MAX` moved into `combatant.ts` (next to `INIT_MIN`/`INIT_MAX`) as the one source of truth — `InitiativeWidget` now imports them instead of redefining. `validateCombatants` clamps `initiative`→`[INIT_MIN, INIT_MAX]`, `hp`/`maxHp`→`[0, HP_MAX]`, and defined `ac`→`[0, AC_MAX]`, so the import path is no longer weaker than the typed add paths. Tests in `combatant.test.ts` assert `1e308`/`-5e12` fields clamp to the bounds and an absent `ac` stays `undefined`.
`artifacts/dm-screen/src/lib/combatant.ts:312-331`
`initiative`, `hp`, `maxHp`, `ac` accept any finite number — a hand-edited backup with `initiative: 1e308` or `hp: -5e12` round-trips validation, while every *typed* path clamps via `clampInitiative` (`INIT_MIN/INIT_MAX`) and the party validator clamps its numerics (`partyStore.ts:90-100`). No crash (sort and `Math.max(0, …)` still behave), but the import path is strictly weaker than the input paths it's documented to mirror.

**Solid:**
- The two-phase backup import is genuinely robust: quota preflight probes only the delta before wiping (`backup.ts:115-131`), the snapshot/rollback path is tested including mid-write failure *and* rollback-failure (`backup.test.ts:244-306`), and the grid-triple atomic eviction plus cross-field length check closes the mixed-state hole.
- The `pendingWrites` flush registry correctly closes the debounced-write race in both directions (export omission and rollback-snapshot omission), with tests for each (`backup.test.ts:308-349`).
- Migration wiring is correct: `runMigrationsOnce()` runs in `main.tsx:8` before `createRoot`, all steps are idempotent and per-step try/caught, the `"null"`-string-is-empty rule is honored, and `legacyInitialValue` in InitiativeWidget covers the quota-failed-copy case.
- `combatant.ts`'s id dedupe (retry loop), the dangling-activeId reconciliation in the widget, and the four-way add-path convergence (event contract with outcome out-param, first-consumer-wins, decide-after-dispatch authority ordering) are carefully reasoned and test-covered.

**Coverage gaps:**
- ~~`monsterSearch.ts` has no test file at all~~ **CLOSED 2026-07-20** — `monsterSearch.test.ts` added (ranking prefix > substring > rich > alpha, empty-query path, `findRichMonster`).
- ~~`useLocalStorage` itself has no direct test~~ **CLOSED 2026-07-21** — `src/hooks/useLocalStorage.test.tsx` added (tier-2 jsdom, 20 tests): heal-on-read write-back (incl. no-rewrite-when-clean and heal-write-throws), debounce timer/flush interplay (unmount, `pagehide`, tab-hidden, and the `pendingWrites` registry sweep), and the `onWriteError`→`onWriteSuccess` failure→success recovery edge. Same pass also added `envelope.test.ts` (schema/version gating + cross-surface hints) and `pendingWrites.test.ts` (register→flush→unregister), which the review's gap list had not enumerated but were untested.
- ~~No hostile-id tests for `normalizePartyBatch`~~ **CLOSED 2026-07-20** — hostile-id tests added (ids ≥ 2^53, negative, non-integer).
- ~~`migrateTurnIndexToActiveId` is tested only with well-formed string-id combatants~~ **CLOSED 2026-07-20** — id-less/duplicate-id legacy-shape test added.
- **STILL OPEN (jsdom-blocked, Playwright/manual only):** `AnchoredDropdown` flip placement (needs a real `getBoundingClientRect`) and `promptForJsonFile` dismissal (real file picker) remain manual-only — known jsdom limits, documented in MANUAL-TESTS-post-rebase.md. These are the only remaining §1 coverage gaps; closing them is a Playwright-infrastructure decision, not a logic gap.

---

## 2. `src/components/widgets/` — the nine widgets

> Note: the first finding independently confirms §1's "two Initiative tiles" P2 and broadens it — **any** duplicated stateful widget (Notepad, Bestiary, …) has the same clobber, not just Initiative.

### ~~[P2]~~ **FIXED** — Duplicate non-singleton widget tiles silently clobber each other's persisted state
> **Fixed 2026-07-21:** "singleton all stateful" — Notepad, Oracle, Bestiary, Compendium, Wizard's Tome, Portal added to `SINGLETON_WIDGET_TYPES`, each wrapped in the new reusable `SingletonGate` (`src/lib/SingletonGate.tsx`). Party exempt (partyStore syncs via `dm-party-changed`). Selector-disable + both App add-path guards already generic over the set. Test: `SingletonGate.test.tsx`.
`artifacts/dm-screen/src/App.tsx:236` / `artifacts/dm-screen/src/types.ts:34`
Only `ai-chat` is in `SINGLETON_WIDGET_TYPES`, so the picker happily places two Notepad, Initiative, Bestiary, etc. tiles — and each mount holds an independent `useLocalStorage` instance on the *same* key with no same-tab sync (the hook has no changed-event mechanism; only `partyStore` does). Concrete failure: place two Notepads (`dm-notepad`, NotepadWidget.tsx:34), type a paragraph in tile A, then type one character in tile B — B's stale `valueRef` overwrites storage and A's paragraph is gone on reload. Two Initiative tiles diverge the same way on any HP click / remove / next-turn (the event path is first-consumer-guarded — combatant.ts:179–185 explicitly acknowledges dual mounts — but direct UI mutations are not). Fix: add the stateful widgets to `SINGLETON_WIDGET_TYPES` (reusing the existing `createSingletonSlot` mount guard), or broadcast a same-tab changed event per key like `dm-party-changed`.

### ~~[P3]~~ **FIXED** — Heal button has no upper clamp — HP can exceed maxHp and the 9999 cap
> **Fixed 2026-07-21:** `updateHp` caps a heal at `Math.max(c.maxHp, c.hp)` (never below current, in case stored hp already exceeds maxHp); damage still floors at 0.
`artifacts/dm-screen/src/components/widgets/InitiativeWidget.tsx:401-405`
`updateHp` computes `Math.max(0, c.hp + delta)` — damage clamps at 0, but heal is unbounded, so repeated clicks show "27/20" and can eventually pass the `HP_MAX = 9999` every add form enforces (line 47). Not corrupting (`validateCombatants` accepts any finite number) but inconsistent with the widget's own bounds. Fix: `Math.min(c.maxHp, ...)` on heal, or at minimum `Math.min(HP_MAX, ...)`.

### ~~[P3]~~ **FIXED** — Compendium and Wizard's Tome render uncapped filtered lists with no virtualization; Compendium filter re-lowercases all content per keystroke
> **Fixed 2026-07-21:** both cap the filtered render at `MAX_RESULTS = 200` with a "showing first 200 of N" footer (mirrors Bestiary). Compendium gained a precomputed `SEARCH_INDEX` + `useDeferredValue` (the Tome already had both).
`artifacts/dm-screen/src/components/widgets/CompendiumWidget.tsx:35-50` / `WizardsTomeWidget.tsx:97-98`
Once `isFiltered`, both render the full match set — up to 642 Compendium rows (a one-character query matches nearly everything via `e.content.toLowerCase().includes(q)`) and 557 spell rows (e.g. filter "All Levels" + one class). Bestiary caps at `MAX_RESULTS = 200` for exactly this reason (BestiaryWidget.tsx:92); these two don't. Compendium additionally has neither `useDeferredValue` nor a precomputed lowercase index (Tome built `SPELL_SEARCH_INDEX` for this), so each keystroke re-lowercases every entry's full content. Fix: apply the Bestiary's cap + footer pattern and precompute a search index / defer the query.

### ~~[P3]~~ **FIXED** — Tile drag-to-reorder never starts in Firefox — dragstart sets no drag data
> **Fixed 2026-07-21:** the grip's `onDragStart` now calls `e.dataTransfer.setData("text/plain", "")` (payload unused; reorder is React-state-driven).
`artifacts/dm-screen/src/components/DMTile.tsx:207-211`
The grip's `onDragStart` sets only `e.dataTransfer.effectAllowed = "move"`; there is no `setData` call anywhere in `src/components/` (grep confirms). Firefox requires `dataTransfer.setData(...)` in dragstart or the HTML5 drag never initiates, so reordering is silently dead there. Fix: `e.dataTransfer.setData("text/plain", "")` in the handler.

### ~~[P3]~~ **FIXED** — Portal "Open in new tab" renders the saved URL with no scheme check
> **Fixed 2026-07-21:** the anchor renders only when the saved value is an `http(s):` URL (`externalHref` guard), so a restored/hand-edited `javascript:`/`data:` value never reaches an href.
`artifacts/dm-screen/src/components/widgets/PortalWidget.tsx:92-99`
The `<a href={savedUrl}>` uses the raw stored string, but both the read validator and the backup-import validator for `dm-portal-url-v1` are length-only (`validateNullableStringMax(PORTAL_URL_MAX)`, backup.ts:417). The UI submit path gates on `toEmbedUrl`, but a restored hostile/hand-edited backup can plant `javascript:`/`data:` — the header (with the link) still renders even when `embedUrl` is null ("no longer supported" only replaces the iframe). `target="_blank"` neuters `javascript:` in modern browsers, but the repo defends hostile backups everywhere else. Fix: require `http(s):` in the portal-URL validator or before rendering the anchor.

### ~~[P3]~~ **FIXED** — Tag-input suggestions can't be reopened by refocusing; loading spinner is unreachable
> **Fixed 2026-07-21:** both `WeaponTagInput` and `SpellTagInput` reopen cached matches on refocus (`onFocus` → `setOpen(true)` when a query + suggestions exist); the never-rendering `loading` state and its now-unused `Search` import were removed.
`artifacts/dm-screen/src/components/widgets/PartyWidget.tsx:121`
`onFocus={() => query && setSuggestions(s => s)}` is a no-op (identity setState) — after an outside-click dismiss (`onRequestClose` → `setOpen(false)`), clicking back into the weapon field with text present never reopens the list until the query changes; `SpellTagInput` lacks even the vestigial handler. Also `setLoading(true)`/`setLoading(false)` at lines 60/74 run synchronously in the same timer callback, so the spinner never renders. Fix: `onFocus` should `setOpen(true)` when suggestions exist; drop the dead loading state.

### ~~[P3]~~ **FIXED** — "Ask Selene instead" is a silent no-op while a turn is streaming
> **Fixed 2026-07-21:** the escalate link is `disabled` (with a "wait for the current answer" title) while a turn streams; `sending` threads through `MessageRow` as a primitive so the memo stays intact (flips twice per turn, not per chunk).
`artifacts/dm-screen/src/components/widgets/AIChatWidget.tsx:810`
`escalate` bails on `sendingRef.current` with zero UI feedback — the link stays enabled, the click just does nothing (the `send` path's identical guard at line 784 deliberately preserves composer text, but the escalate link has no such rationale). Fix: disable the link (or flash "wait for the current answer") while `sending`.

### ~~[P3]~~ **FIXED** — Icon-only controls missing accessible names
> **Fixed 2026-07-21:** the empty tile's "+" add button and Party's edit-pencil button gained `title` + `aria-label`. (Drag/resize handles remain pointer-only by design.)
`artifacts/dm-screen/src/components/DMTile.tsx:177-184`
The empty tile's "+" add button has neither `title` nor `aria-label` (compare the header's remove button at 224-230, which has `title`). Same for PartyWidget's edit-pencil button (PartyWidget.tsx:728-731; its delete sibling *does* have `title`). Drag/resize handles are pointer-only with no keyboard path (acknowledged trade-off, but worth noting). Fix: add `aria-label`/`title` to the icon-only buttons.

**Solid:**
- The `dm-add-to-initiative` contract is genuinely airtight: cancelable event with an `outcome` out-param, first-consumer-wins guard (`defaultPrevented` bail, combatant.ts:199), `preventDefault` only *after* a successful commit so a throwing listener falls through to the storage fallback, listener registered in a `useLayoutEffect` (InitiativeWidget.tsx:249-253) to close the pre-paint gap, and the fallback decides against storage only after dispatch — all cross-tested against the real mounted widget in `InitiativeWidget.addPaths.test.tsx`.
- `useLocalStorage`'s `valueRef`/`getLatest` design eliminates the classic stale-closure clobber for same-tick writes, and debounced writes flush on unmount/pagehide/tab-hide/backup sweep; every key pairs with the same shape validator the backup importer uses.
- AI Chat stream handling: id-keyed (not index-keyed) message writes survive cap-trims mid-stream, the abort controller doubles as a turn-identity token gating every turn-global write, the stall watchdog sizes from the bridge's reported cap with a trust ceiling, a clean close without a terminal event is surfaced as an error, and degraded mode (offline vs. origin-blocked, banner + chip + per-message bubbles) is carefully disambiguated. Transcript growth is dual-capped (count + bytes, with per-message oversize clamping) below the backup importer's silent-skip threshold.
- Every suggestion list portals through `AnchoredDropdown` (with scroll/resize/ResizeObserver re-measure and flip logic); no widget renders a dropdown inside the tile's `overflow: hidden`.

**Coverage gaps:** *(substantially narrowed 2026-07-21 — see the remediation-log entry; 27 tests added)*
- ~~AI Chat has component tests only for the singleton mount guard~~ **PARTIALLY CLOSED** — the degraded-mode **banner** (offline/blocked/online) and its **transition** (Retry clears it) are now covered (`AIChatWidget.banner.test.tsx`), and the escalate-disable-while-streaming guard via `ChatLocalAnswer.test.tsx`. Still open: the SSE **streaming** loop internals and full escalation-reset (SSE-mock heavy); the transcript **cap** stays covered at the lib tier (`chatHistory.test.ts`).
- ~~No component tests for Bestiary, Party tag inputs, Compendium, Portal~~ **CLOSED** — Bestiary target-consumption, Party weapon tag-input refocus, Compendium/Tome cap+footer+index, and the Portal scheme guard (`toExternalHref`, tier-1) all have tests now. **Still open:** Oracle functional tests, Party import at the *widget* tier (file-picker-blocked; pure logic covered in `partyStore.test.ts`), and DMTile/App drag-reorder + corner-resize **geometry** (needs real layout).
- jsdom structurally can't cover the AnchoredDropdown flip, storage quota, real modal semantics, or the Firefox `setData` drag path — Playwright/manual only, tracked in MANUAL-TESTS-post-rebase.md.

---

## 3. `scripts/src/data-generators/` — offline generators

### ~~[P1]~~ **FIXED** — `{@recharge N}` unhandled — 96 monster actions lose their recharge mechanic
> **Fixed 2026-07-18:** dedicated `{@recharge N}` rule in `stripTags` (runs before the zero-arg/generic passes; `(Recharge N–6)` / `(Recharge 6)` matching the 5etools renderer), covered by new tests in `scripts/src/data-generators/lib.test.ts` (first tests for the generators — vitest wired into `scripts/`). Full regen of `monsters.ts`: 0 bare-number action names remain. Note the regen also baked in d1d13e8's cross-source gate (committed data had drifted behind the generator): ~30 A5e/Kobold-Press rows swapped wrongly-attached WotC blocks for own-book Open5e blocks, rich count 2,146 → 2,144; CLAUDE.md counts updated.
`scripts/src/data-generators/lib.ts:44-56` (zero-arg map), `lib.ts:126-129` (generic fallback)
`ZERO_ARG_TAGS` maps only the bare `{@recharge}` (to `"(Recharge)"`, itself lossy — 5etools renders it "(Recharge 6)"). The one-arg form `{@recharge 5}` — used 99× in bestiary-xmm.json alone — falls through to the generic first-pipe-segment rule and becomes a bare number. Result: 96 action names in `artifacts/dm-screen/src/data/monsters.ts` like `"Fire Breath 5"` (×21), `"Lightning Breath 5"` (×13), `"Acid Breath 5"` (×12) — the DM sees a meaningless trailing digit instead of "(Recharge 5–6)", losing a core combat mechanic on every 5etools-sourced dragon/breath monster. Fix in `stripTags`: add `/\{@recharge\s*(\d)?\}/g` → `(Recharge ${n ? n + "–6" : "6"})` before the generic rule.

### ~~[P1]~~ **FIXED** — Hyphen-variant feat names dodge dedupe — duplicate ids `feat-fey-touched` / `feat-shadow-touched`, 2014 text ships alongside 2024
> **Fixed 2026-07-18:** `dedupeByName` now keys on `slugify(name)` — the same normalization the ids are minted from, so anything the slug collapses must dedupe. Helpers extracted to `scripts/src/data-generators/dedupe.ts` (side-effect-free, testable; `generate-compendium.ts` runs `main()` at import) with tests in `dedupe.test.ts`. Regen removed exactly the two TCE duplicates (564 → 562, XPHB versions survive); zero duplicate ids remain in `compendiumRules.ts`; CLAUDE.md count updated.
`scripts/src/data-generators/generate-compendium.ts:54-63` (`dedupeByName` keys on exact `name.toLowerCase()`), `:65-70` (`slugify`)
5etools names these feats "Fey Touched" (TCE) but "Fey-Touched" (XPHB) — different keys, so both survive dedupe, violating the 2024-wins rule; `slugify` then collapses both to the same id. Confirmed in `artifacts/dm-screen/src/data/compendiumRules.ts:1469` + `:1480` (both `id: "feat-fey-touched"`) and `:2932` + `:2943` (`feat-shadow-touched`). Duplicate ids break React keys / anchor lookups in the Compendium widget and the documented 564 count includes two entries that shouldn't exist. Fix: dedupe on `slugify(name)` (or a `normalizeTitle` that strips hyphens), keeping `pickBestBySource`.

### [P2] `stripTags` is single-pass — nested tags leak `@tag` residue into 6 entries
`scripts/src/data-generators/lib.ts:91-137`
The generic rule's `[^}]*` payload matches across an inner tag's `{`, so `{@note ... {@damage 2d6} ...}` degrades to `@damage 2d6` in output instead of clean text. Confirmed leaks: `weapons.ts:1814` and `:3316` ("extra @damage 2d6 …"), `weapons.ts:3469`/`:3483` ("paired with @item True-Ice Shards"), `compendiumRules.ts:163` ("used to @book stabilize a creature"), `:4999` ("@link intended for NPCs"), `:5692` ("@deck Tarokka Deck"). Fix: replace innermost-first with `/\{@(\w+)\s([^{}]*)\}/` in a loop until fixpoint, then the existing brace-unwrap.

### [P2] Open5e text passed through unsanitized — HTML entities, BBCode junk, markdown in stat blocks
`scripts/src/data-generators/generate-monsters.ts:757-767` (`nonEmpty`, `open5eTraits`), `:769-819` (`transformOpen5e`)
Open5e strings go into output verbatim: `&amp;` appears 6× in `monsters.ts` (lines 33558, 71770, 77708, 78918, 81624, 86375 — all damageResistances/senses); `monsters.ts:86375` (Phoenixborn Sorcerer) is outright garbage: `damageResistances: "[++], Senses, &amp; [/++][++]Languages[/++] as Phoenixborn"`; markdown emphasis `*At Will:*` leaks at `:96820`/`:97073`. The DM sees raw markup mid-stat-block. Fix: run Open5e strings through an entity-decode + `[/**]`-style/markdown strip in `transformOpen5e` (a small `cleanOpen5e()` next to `nonEmpty`).

### [P2] Renamed CSV column silently zeroes the whole dataset
`scripts/src/data-generators/generate-monsters.ts:961-975`, `:984-999`
`idx()` returns -1 for a missing header; `row[-1]` is `undefined`, and every field parse has a silent default (`parseInt(...)||0`, `?? ""`). If the curated CSV is re-exported with "AC" renamed to "Armor Class", all 2,158 monsters get `ac: 0` with a clean exit and plausible-looking output. Fix: after the `idx()` block, throw if any required index is -1.

### [P2] Canonical pass bypasses the cross-source gate — A5e "Goblin Boss" row carries WotC's stat block
`scripts/src/data-generators/generate-monsters.ts:561-571` (ungated canonical attach), `:1022-1041` (merge by name only)
The CR+type gate protects only step-2 bulk matches; CANONICAL_RICH_NAMES entries attach to any same-named CSV row regardless of the row's source. Confirmed: the CSV "Goblin Boss" row is sourced "A5e Monstrous Menagerie", yet the merged entry ships the 5etools (XMM/MM) block while retaining A5e source + pageNumber metadata — a stat/provenance mismatch (page number points at a book containing a different stat block) of exactly the collision class the gate exists for. Fix: when a canonical name's CSV row has a source in `OPEN5E_SLUG_BY_CSV_SOURCE`, either gate with `richMatchesCsv` or prefer the Open5e own-book block.

### [P3] Open5e feat pass doesn't dedupe against the 5etools pass — duplicate "Survivor" title
`scripts/src/data-generators/generate-compendium.ts:314-343` (checks only `existingTitles` = hand-curated)
`compendiumRulesData` contains both `feat-survivor` (5etools) and `feat-a5e-survivor` — two "Survivor" entries in the widget. Fix: accumulate emitted titles across sections and check those too (or accept as intentional and tag-differentiate in the UI).

### [P3] Tie-break among unranked sources depends on `readdirSync` order
`scripts/src/data-generators/generate-monsters.ts:462-476` (`indexBestiary`), `:367-383` (`pickMonster` keeps first-found for equal rank)
For a name whose only candidates are outside `SOURCE_PRIORITY` (both rank = length), the winner is whichever file `fs.readdirSync` yielded first — unspecified order, so a regen on a different filesystem can flip stat blocks and produce a noisy diff. Fix: `files.sort()` after the readdir (same for the spells generator's ordering, which is already fixed by `SOURCE_FILES`).

### [P3] Generated header understates provenance for mixed-license outputs
`scripts/src/data-generators/lib.ts:172-190`
Every header hardcodes `Pinned to: 5etools-src @ v2.31.0` and `License: 5etools content is MIT-licensed…`. For `monsters.ts`/`compendiumRules.ts` the OGL note only rides in the Source line, and the Open5e pin (v1.12.0) appears nowhere in the file. Fix: let `generatedHeader` take optional extra pin/license lines and emit `open5e-api @ v1.12.0` + OGL/CC-BY on the two mixed files.

**Solid:**
- Zero `{@…}` brace leaks in all four generated files; documented counts match exactly (spells 557, monsters 2,160 with 2,146 rich / 14 thin, weapons 251, compendiumRules 564); no duplicate monster/spell/weapon names; no thin/rich invariant violations (0 entries with traits-but-no-actions).
- 2024-priority machinery works where names match: Cure Wounds is 2d8 (XPHB), Fireball scaling correct, XMM > MM via `SOURCE_PRIORITY`, XPHB listed first in `SOURCE_FILES` with first-wins dedupe.
- The lossy/cross-source CR+base-type gate (`richMatchesCsv`, `crValue` failing closed on unparseable CRs) is careful, well-commented design; `compendium.ts` is genuinely never written by any generator, and `loadExistingTitles` matches all 78 hand-curated titles.
- `tsLiteral` JSON-stringifies every string — no unescaped quote/backtick issues anywhere in ~10 MB of generated TS; deterministic sorts + sort-derived ids in weapons/spells/compendium.

**Coverage gaps:**
- No tests exist for the generators (`scripts/` has no `*.test.ts`): `stripTags`, `parseCSV`, `resolveFiveToolsKey`, and the gating logic are all untested despite being the highest-regression-risk code reviewed here.
- `../open5e-api` is absent on this machine (only `../5etools-src` is present), so the monsters/compendium generators could not be re-run; Open5e-path behavior and run-to-run determinism were verified statically plus via committed output only.
- Nothing verifies that a regen reproduces the committed files (no CI diff-check), so drift between generator changes and committed data would go unnoticed.
- `STRICT_TAGS=1` unknown-tag logging is opt-in; a normal regen silently drops any new 5etools zero-arg label tag.

---

## 4. `services/ai-bridge/` — optional AI bridge

### [P2] Wedged turns are abandoned with no subprocess cleanup and no operator logging
`services/ai-bridge/src/server.ts:337-352,369-387`
When the wedge race declares a turn abandoned, the slot is released and the response ended, but nothing attempts to reclaim the underlying Claude Code + ddb-mcp subprocess tree — the abort was by definition ignored (that is the wedge premise), `turn.return()` queues behind the stuck `next()` forever (server.ts:377), and the SDK `query` object's `interrupt()` is never exposed from `runChatTurn` (agent.ts:110) or invoked. Repeated wedges accumulate orphaned subprocess pairs that keep spending memory and potentially subscription until they self-terminate. The entire path is also silent — no `console.error` anywhere in the wedge/abandon branch, so the operator sees healthy `/health` and never learns turns are wedging. Fix: log the abandonment with the turn's age/cause, and escalate — expose the query handle so the wedge path can call `interrupt()` (or spawn-track PIDs for a hard kill).

### [P3] `AI_BRIDGE_TURN_TIMEOUT_MS` > 2³¹−1 (or `Infinity`) silently becomes a 1 ms timeout — total chat outage
`services/ai-bridge/src/server.ts:26-28,310-313`
`TURN_TIMEOUT_MS` accepts any positive `Number(env)`; a value above 2147483647 (or `Infinity`) makes Node clamp `setTimeout` to 1 ms (verified: `TimeoutOverflowWarning … set to 1`), so every turn aborts near-instantly with a bizarre "exceeded the Ns time limit" message. `Infinity` additionally serializes as `turnTimeoutMs: null` in `/health` (verified), violating the `number | undefined` wire type — the client's `stallTimeoutForTurn` happens to guard `typeof number` so it degrades, but the health test at server.test.ts:161 would catch none of this. Inconsistent with the repo's own fail-loud `envPort` precedent (config.ts:12-20). Fix: validate as a bounded integer (reject or clamp at 2³¹−1) and fail startup loudly like `envPort`.

### [P3] `smoke.ts` silently drops `tool_result` and `tool_error` events
`services/ai-bridge/src/smoke.ts:22-40`
The switch handles `text`/`tool`/`done`/`error` but has no case (and no default) for `tool_result` or `tool_error`, so a smoke run against a broken ddb session shows a tool being called and then nothing — a `tool_error` (e.g. expired `session.json`, the exact condition the README tells users to smoke-test for) is invisible and doesn't set `process.exitCode = 1`. Fix: print `tool_result` titles and treat `tool_error` like `error` for output (arguably not for exit code).

### [P3] `startServer`'s error listener can't survive past listen — a later `server` 'error' is first swallowed, then fatal
`services/ai-bridge/src/server.ts:488-491`
`server.once("error", reject)` stays armed after `listen` succeeds; the first post-listen `'error'` event consumes it as a no-op reject on a settled promise (silently swallowed), and any second `'error'` emits with zero listeners — an uncaught `'error'` event that crashes the process. Post-listen `http.Server` errors are rare (accept failures), so impact is low, but the intent (reject only pre-listen failures like EADDRINUSE) should be encoded: remove the listener in the listen callback and install a logging handler instead.

### [P3] SSE writes ignore backpressure
`services/ai-bridge/src/server.ts:175-177,356`
`sse()` discards `res.write()`'s return value and nothing awaits `'drain'`, so a connected-but-stalled reader buffers the whole turn in Node memory. Bounded in practice (`maxTurns: 12`, 96 K-char card cap → low single-digit MB worst case, loopback-only clients), so this is a note, not a fire: if card caps or turn limits ever grow, gate the pull loop on the write return.

### [P3] Stale coverage descriptions: vitest config comment and CLAUDE.md
`services/ai-bridge/vitest.config.ts:3-5`
The comment claims "pure logic (tool-result parsing) … no SDK/network", and CLAUDE.md's testing section says the bridge config "covers the bridge's pure tool-result parsers in toolResults.ts" — but the suite now includes real-socket HTTP lifecycle tests (`server.test.ts` binds ephemeral ports, drops sockets) and an SDK-mocking gate test (`agent.test.ts`). Harmless, but a reader deciding where a new integration test belongs will be misled. Update both descriptions.

**Solid:**
- The three-layer tool gate (`tools: []` + `disallowedTools` + `canUseTool`, deliberately *not* using `allowedTools` to avoid pre-empting `canUseTool`) is correctly reasoned, regression-pinned in `agent.test.ts`, and the allowlist audit in `ddbTools.test.ts` pins every forbidden write/browser tool.
- Localhost security is far above the usual bar: reflected (never `*`) ACAO, Origin 403 before any work, DNS-rebinding Host gate ordered *before* the Origin gate, PNA preflight assertion scoped to allowlisted origins, and anti-fingerprinting ACAO reflection limited to private origins — all covered by real-socket tests including IPv6 edge ranges.
- Slot lifecycle is airtight where it's cooperative: claim-inside-try with once-guarded release, no awaits between check and claim, terminal-event guarantee on every exit path (synthesized in `finally`), disconnect abort via `res 'close'`, and the `pull.catch` unhandled-rejection guard on the abandoned race. Protocol symmetry with `aiBridge.ts` checks out exactly (event names, single-line JSON `data:`, `\n\n` framing, health field contract, 403/429 body shapes).
- Auth scrubbing makes billing unambiguous in both modes (both credential directions tested), and secrets/paths never reach the wire or logs (`ddbMcpEntry` deliberately kept off `/health`, with a test pinning it).

**Coverage gaps:**
- The entire SDK-message → BridgeEvent mapping loop (`agent.ts:152-196`) — text/tool_use yielding, `toolNamesById` correlation, the `is_error` → `tool_error` branch, string-content skip, and `done` mapping for non-success subtypes — has zero tests; `agent.test.ts`'s mock generator yields nothing, so a drift in SDK message shape or a correlation regression passes CI silently.
- No test for the oversized-body path: the 64 KB cap, the 400 + `Connection: close`, and the paused-request teardown (`server.ts:154-173,216-224`).
- No cross-implementation SSE round-trip test: `sse()`'s framing and the widget's `parseSseRecord` are each verified only against hand-rolled counterparts in their own suites.
- toolResults parsers are pinned to captured ddb-mcp 2.10.1 output; a wrapped/continuation `Spells:` line, a non-`(L#)` annotation like `(at will)`, or an underscore-italic monster subtitle would silently degrade (by design) with no canary test against the installed package's real output to flag the drift.

---

## 5. Config/infra — vite/PWA/Docker/nginx/CI

### [P2] .dockerignore secret/log patterns only match the repo root, not nested dirs
`.dockerignore:29-43`
Docker `.dockerignore` patterns without a `**/` prefix match only at the context root, and the file itself proves the author knows this (`**/node_modules`, `**/dist`, `**/*.swp`). But the secret-shaped patterns — `.env`, `.env.*`, `*.pem`, `*.key`, `*.p12`, `*.pfx`, `secrets*` — and `*.log` are all root-anchored. A `services/ai-bridge/.env` (the one package that IS env-configured: `AI_BRIDGE_PORT`, `AI_BRIDGE_ALLOWED_ORIGINS`, auth tokens per the bridge docs) or an `artifacts/dm-screen/dev.key` would sail into the build context and land in build-stage layers via `COPY . .` at `Dockerfile:48` — exactly the leak the comment at `.dockerignore:36` says the list exists to prevent. Fix: prefix all secret/log patterns with `**/` (e.g. `**/.env`, `**/.env.*`, `**/*.pem`). No nested secret file exists today (verified by `find`), so this is latent, not an active leak.

### [P2] vite.config.ts, vitest.config.ts, and all dm-screen test files have zero typecheck coverage
`artifacts/dm-screen/tsconfig.json:3-4`, `package.json:15` (root), `tsconfig.json:4-5` (root)
dm-screen's tsconfig has `include: ["src/**/*"]` and excludes `**/*.test.ts(x)`; the root `typecheck:libs` is `tsc --build` against a tsconfig with `references: []` / `files: []` — a no-op that compiles nothing. Net result: no path (`pnpm typecheck`, `typecheck:deployable`, CI) ever type-checks `vite.config.ts`, `vitest.config.ts`, or any dm-screen `*.test.ts(x)` file. Vite loads its config via esbuild (type-stripping only) and vitest transforms tests the same way, so a type error in the PWA config or a test asserting against a stale API shape never surfaces anywhere. Fix: add a `tsconfig.node.json` (config files) and a test-inclusive tsconfig, wired into the package `typecheck` script; the ai-bridge package already type-checks its tests (its `include: ["src"]` has no test exclude), so this is a dm-screen-only hole.

### [P2] CI never runs `pnpm build`, so verify-precache and the bundle scans don't gate merges
`.github/workflows/ci.yml:44-48`, `artifacts/dm-screen/scripts/verify-precache.mjs`
CI runs `pnpm typecheck` + `pnpm test` only. The three build-time guards — verify-precache's 8 MiB-cap check on `data-*` chunks, its baked-`AI_BRIDGE_URL` define assertion, and the documented `grep "/api/" dist` scan — run only on a developer's machine or inside a Docker build nobody is required to run pre-merge. Concrete failure: a monster-dataset regen pushing `data-monsters` past 8 MiB, or a Vite upgrade that stops honoring the `import.meta.env.AI_BRIDGE_URL` define, merges green and is first caught at deploy time. Fix: add `pnpm build` (it already chains typecheck:deployable + vite build + verify-precache) as a CI step.

### [P2] claude-code-review.yml has no author gate, unlike claude.yml
`.github/workflows/claude-code-review.yml:4-5,14-19`
`claude.yml:21-24` carefully gates every trigger arm on `OWNER/MEMBER/COLLABORATOR` because the job "holds CLAUDE_CODE_OAUTH_TOKEN (subscription spend) and runs an attacker-authored prompt" — but `claude-code-review.yml` fires on every `pull_request` from anyone with the author-filter left commented out, holding the same token plus `id-token: write` while processing attacker-authored PR content. On a public repo, any drive-by PR burns subscription spend and exposes a prompt-injection surface. Fix: add the same `author_association` condition (or `pull_request_target`-style trust gating) that claude.yml already uses.

### [P3] globPatterns omit `jpg`, and a jpg is the one asset type the build actually emits uncovered
`artifacts/dm-screen/vite.config.ts:103`, `artifacts/dm-screen/public/opengraph.jpg`
The precache glob lists `png,ico,webp` (none of which exist in dist) but not `jpg/jpeg`, and `opengraph.jpg` is confirmed absent from the built `sw.js` manifest. Harmless today — only external social scrapers fetch it — but any future in-app `.jpg` asset silently misses the precache and 404s offline at the table. Fix: add `jpg,jpeg` to the glob (or convert opengraph to webp and note the invariant).

### [P3] Root `typecheck:libs` is a documented no-op
`package.json:15-16` (root), `tsconfig.json:4-5` (root)
`tsc --build` against `files: [], references: []` compiles nothing, yet both `typecheck` and `typecheck:deployable` chain it as if it did work, implying bridge-protocol is built there (it's actually only checked via its own `-r` script and via source-inclusion into dm-screen's program). Misleading during debugging and a place where someone "fixes" typecheck by adding references the architecture deliberately avoids. Fix: delete the step or replace with a comment-bearing `echo`.

### [P3] Stale "expo requires it" pin on react 19.1.0
`pnpm-workspace.yaml:48-51`
The catalog pins `react`/`react-dom` to exactly `19.1.0` "because expo requires it" — there is no expo anywhere in this workspace (grep confirms). The exact pin blocks React patch/security updates for a reason that no longer exists. Fix: relax to `^19.1.0` or update the comment to the real constraint if one exists.

### [P3] vitest version duplicated outside the catalog
`artifacts/dm-screen/package.json:77`, `services/ai-bridge/package.json:22`
`vitest: ^4.1.9` appears verbatim in two packages instead of the catalog that exists for exactly this. Given CLAUDE.md's documented hazard that vitest's peer-hash (`jsdom`) changes ripple across every workspace project, letting the two copies drift to different minors would produce two `.pnpm` vitest instances and confusing symlink behavior. Fix: move to `catalog:`.

### [P3] `.claude/` reaches the Docker build context
`.dockerignore` (absent entry), repo root `.claude/`
`.claude/` (local settings, `settings.local.json` permission allowlists) is not excluded, so it enters the context and build-stage layers via `COPY . .`. Not a secret today, but it's local-only state of exactly the kind the file's preamble says it excludes. Fix: add `.claude/` alongside `docs/`.

**Solid:**
- Dockerfile manifest COPY set (`Dockerfile:28-36`) exactly matches the lockfile's five importers (`.`, `artifacts/dm-screen`, `packages/bridge-protocol`, `scripts`, `services/ai-bridge`) — the filtered `--frozen-lockfile` install cannot fail on a missing manifest, and corepack is pinned with `COREPACK_DEFAULT_TO_LATEST=0`.
- PWA chain verified end-to-end on the actual dist: largest chunk `data-monsters` is 4.07 MB vs the 8 MiB cap (~2x headroom), all four `data-*` chunks named exactly as verify-precache expects, `manifest.webmanifest` is in the precache, bundle scans clean (`/api/` zero hits, `bridge-protocol` erased), and nginx no-cache covers sw.js/registerSW.js/manifest/index.html plus the SPA-fallback 200 path (`nginx.conf:104-108`).
- CSP (`security-headers.conf:53`) is tight and exactly scoped: `script-src 'self'` with no inline, connect-src covers both bridge host spellings + both font origins (needed for in-SW fetches), frame-src is a curated Portal allowlist rather than `https:`, `frame-ancestors 'none'` + `base-uri`/`form-action 'self'`.
- ARM64 claim holds: every `linux-arm64-gnu` native variant (esbuild, rollup, lightningcss, oxide) survives the overrides block; only musl/win/bsd/exotic arches are dropped. `minimumReleaseAge: 1440` intact (`pnpm-workspace.yaml:28`), esbuild pinned to patched 0.27.3, healthchecks correctly mirrored between Dockerfile and compose (compose override would otherwise discard the body-grep integrity check).

**Coverage gaps:**
- No CSP in dev/preview (documented as accepted in `security-headers.conf` comments) — CSP regressions are only observable in the Docker container, and nothing automated ever boots the container.
- No CI exercise of the Docker build itself (filtered-install breakage, e.g. a forgotten manifest COPY after adding a workspace package, is caught only when someone runs `docker compose up --build` locally).
- `verify-precache.mjs` is plain `.mjs` — no typecheck coverage by design; its two guards are the only automated PWA regression net, and they only run via `pnpm build` (see CI finding above).
- No automated check that `security-headers.conf`'s frame-src list stays in sync with `EMBED_HOSTS` in `portalEmbed.ts`, or that the CSP's `:38900` stays in sync with `AI_BRIDGE_PORT` defaults — both are comment-enforced couplings only.
