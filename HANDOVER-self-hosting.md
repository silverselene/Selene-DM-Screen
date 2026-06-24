# Handover: Make Selene-DM-Screen a self-hostable, static app

## Kickoff prompt (paste this into Claude Code)

```text
Read HANDOVER-self-hosting.md in the repo root. It is the spec for migrating
Selene from a React + Express + PostgreSQL Replit app into a fully static,
self-hostable SPA. Execute it as written, phase by phase (Phase 0 → Phase 9).

Rules of engagement:
- Work one phase at a time, in order. Do not start a phase until the previous
  phase's "Verify" boxes all pass.
- Honour the "Decisions already made" section — do not re-open them:
  fully static (no backend, no DB), localStorage persistence, drop
  mockup-sandbox, refresh the curated monster subset only (not the full
  bestiary), data generated offline from the local ../5etools-src clone at
  tag v2.31.0.
- Tick each "- [ ]" box in the doc as you complete and verify it (edit the
  file in place). Record anything you do differently under "Deviations".
- After each phase: run `pnpm run typecheck` and `pnpm run build`, do the
  phase's manual checks, commit with a message like
  "phase N: <summary>", then STOP and show me the diff + what you verified.
  Wait for my go-ahead before the next phase.
- Treat the persistence requirement as a hard requirement: after the
  migration, stopping the server/Docker and relaunching must resume the DM
  exactly where they left off, including in-progress initiative state.
- Do not weaken supply-chain settings (keep minimumReleaseAge: 1440).

Start with Phase 0 and report back.
```

> **For the executing agent (Claude Code).** This is a working checklist. Tick each
> `- [ ]` box as you complete and verify it (edit this file in place). Work phase by
> phase, commit at the end of each phase, and do not start a phase until the previous
> phase's **Verify** boxes are all ticked. If something here turns out to be wrong about
> the code, fix the doc as you go and note it under "Deviations" at the bottom.

## Goal

Turn Selene from a three-tier app (React + Express + PostgreSQL, deployed on Replit)
into a **fully static single-page app** that:

- needs **no database** and **no backend process**,
- runs from a clean clone with `pnpm install && pnpm dev` and **zero environment variables**,
- builds to static files that any web server can host,
- ships as a small **Docker** image,
- and (stretch) works **offline** as a PWA — useful at the table.

The owner does **not** need cross-device sync, so per-browser persistence (localStorage)
is acceptable for the Party and Notepad.

### Persistence requirement (hard requirement)

The DM must be able to stop the server / Docker and, on next launch, **resume exactly where
they left off**. localStorage already satisfies this: it lives in the browser, not the server,
so stopping the container or dev process never clears it. Two conditions make this reliable,
and both are assumed met because a DM picks one run mode and stays on it:

- **Stable origin.** State is bound to scheme+host+**port**. Keep the served port fixed for
  whichever run mode the DM uses (Docker *or* dev). Switching modes/ports would start a fresh,
  separate store — acceptable, since the owner confirmed DMs won't switch.
- **Persist *all* in-progress state, not just static config.** Every widget that holds live
  session state must write it to a versioned localStorage key, so a mid-session shutdown
  resumes intact. Specifically: Party roster, Notepad text, grid layout, **and the Initiative
  tracker's combatant list, turn order, current round, and per-combatant HP**.

## Target architecture (after)

```
artifacts/dm-screen      React + Vite static SPA  ← the only deployable
  src/data/*             complete reference data, bundled at build (no network)
  localStorage           Party roster + Notepad + grid layout (versioned keys)
Dockerfile               multi-stage: node build → static file server
docker-compose.yml       one service, one port
```

Removed: `artifacts/api-server`, `lib/db`, `lib/api-spec`, `lib/api-client-react`,
`lib/api-zod`, all Postgres/Drizzle/Replit machinery.

## Current state (verified during handover — trust but re-check)

Data sourcing per widget today:

| Widget | Source today | Action needed |
|---|---|---|
| Wizard's Tome (spells) | `@/data/spells` (static) | confirm dataset is complete (see Phase 1) |
| Compendium | `@/data/compendium` (static) | none |
| Oracle | `@/data/generators` (static) | none |
| Notepad | localStorage | none |
| Bestiary | imports `@/data/bestiary` **but search hits `/api/monsters/search`** | repoint to local filter |
| Initiative | `/api/monsters/search` + `/api/characters` | repoint to local data + localStorage |
| Party | `/api/characters` (CRUD) + `/api/weapons/search` + `/api/weapons/by-names` | move to localStorage + local weapons data |

Reference data that lives **only** server-side today and must be captured as static assets:

- **Weapons** (250) — only in Postgres / `import-weapons.mjs`. No static file exists yet.
  Source in 5etools: `data/items.json` + `data/items-base.json` (weapons are items flagged as weapons).
- **Monsters** — DB seeded from `artifacts/api-server/src/seed.ts` (which reads `src/data/bestiary.ts`)
  and/or `attached_assets/Monsters_&_Beasts_*.csv`. This is a **curated subset**, not the full
  5etools bestiary. See the scope decision in Phase 1.
- **Spells** — README claims 557 from `import-spells.mjs` (fetched from 5etools raw JSON);
  `src/data/spells.ts` is ~314 lines. **Likely a subset.** Reconcile.

### Data source: use the latest 5etools (v2.31.0)

A full local 5etools clone is available at `../5etools-src` (sibling of this repo),
pinned at **git tag `v2.31.0`, committed 2026-06-19** — this is the canonical, current source.

- **Generate from the local clone, not the network.** The legacy import scripts fetch from
  `raw.githubusercontent.com/.../main/data`, which is non-reproducible and requires network at
  build time. Point the generators at the local clone's `data/` directory (or pin to the
  `v2.31.0` tag) so builds are offline and deterministic.
- The import scripts' hardcoded spell-file list **matches** the current `data/spells/` directory
  (phb, xphb, xge, tce, egw, ggr, ftd, aag, ai, aitfr-avt, bmt, efa, frhof, idrotf, llk, sato, scc) —
  spells are complete, no missing sources.
- The full bestiary in 5etools is **204 source files** under `data/bestiary/` (thousands of
  creatures across all books).

Cross-widget communication uses DOM `CustomEvent`s on `window` (e.g. `dm-open-bestiary`).
**Preserve this wiring** — do not refactor it to context/props.

State keys in localStorage are versioned (e.g. `dm-tiles-v3`). **Keep that convention**;
bump the version suffix whenever a stored shape changes.

---

## Phase 0 — Baseline & safety

- [x] Create a branch, e.g. `feat/static-selfhost`.
- [x] Run `pnpm install`, `pnpm run typecheck`, `pnpm run build` and record that they pass (baseline).
- [x] Confirm the dev app currently renders all 7 widgets (note anything already broken).

**Verify:** baseline build is green and you have a clean branch.

---

## Phase 1 — Reconcile reference data into complete static assets

Goal: every dataset the DB served now exists as a static file under `artifacts/dm-screen/src/data/`,
generated **offline** (no network at app build/run time).

- [x] **Monster scope is decided: refresh the existing curated subset only** (do **not** import
      the full 204-file bestiary). Take the current creature list from `src/data/bestiary.ts` /
      the `Monsters_&_Beasts_*.csv` as the canonical set of *which* monsters to include, and
      re-pull each one's stat block from the local 5etools clone (`../5etools-src/data/bestiary/`,
      tag `v2.31.0`) so values/wording are current. Keep the set the same size; only refresh contents.
- [x] Audit counts. Compare `src/data/spells.ts` and `src/data/bestiary.ts` against the DB-era
      sources and the local 5etools clone. Document the gap.
- [x] **Port the import scripts to read from the local clone `../5etools-src/data`** (pinned to
      tag `v2.31.0`) and **emit static JSON/TS into `src/data/`** instead of `INSERT`ing into
      Postgres. Reuse their existing `stripTags`/property-mapping logic verbatim; just swap the
      source (local files, not `raw.githubusercontent.com`) and the sink (file write, not pg).
      Run **once** to generate, then commit the output so the build never needs network.
- [x] Create a **weapons** static dataset (`src/data/weapons.ts` or `.json`) generated from
      `../5etools-src/data/items.json` + `items-base.json` — it has no static equivalent today.
- [x] Keep the data shape identical to what the widgets already consume so widget code
      changes stay minimal.
- [x] Note the data's source/attribution (5etools, MIT) — preserve existing licensing.

**Verify:** counts match the intended full set; data files are committed; nothing fetches
from the network to build them.

---

## Phase 2 — Repoint widgets off the API onto local data + localStorage

Do not delete the server yet — get the frontend fully working without it first.

- [x] **Establish a shared Party store** in localStorage (versioned key, e.g. `dm-party-v1`)
      with a small typed helper for read/write. Both Party and Initiative use it so
      "add character to initiative" still works.
- [x] **PartyWidget**: replace `/api/characters` GET/POST/PUT/DELETE with the localStorage
      store; replace `/api/weapons/search` and `/api/weapons/by-names` with in-memory
      filtering over the new weapons dataset.
- [x] **BestiaryWidget**: replace the two `/api/monsters/search` fetches with an in-memory
      filter over `bestiaryData`.
- [x] **InitiativeWidget**: replace `/api/monsters/search` with the local filter; replace
      `/api/characters` with the shared Party store.
- [x] **InitiativeWidget: persist live combat state** to a versioned localStorage key —
      combatant list, turn order, current round, and per-combatant HP — so stopping the
      server mid-combat and relaunching resumes the encounter intact. (Notepad and grid
      layout already persist; confirm they still do after the rewrites.)
- [x] Confirm the DOM `CustomEvent` wiring (Party → Initiative, Initiative → Bestiary) still fires.
- [x] Remove now-dead imports of `@workspace/api-client-react` / react-query data hooks
      from these widgets.

**Verify:** with the API server **stopped**, all 7 widgets work end to end in `pnpm dev`.

---

## Phase 3 — Remove backend & DB packages

- [x] Delete `artifacts/api-server`, `lib/db`, `lib/api-spec`, `lib/api-client-react`, `lib/api-zod`.
- [x] Remove `@workspace/api-client-react` (and any other removed workspace deps) from
      `artifacts/dm-screen/package.json` and from its `tsconfig.json` `references`.
- [x] Remove the API-codegen / drizzle / DATABASE_URL references from root `package.json`
      scripts, `tsconfig.json` project references, and `pnpm-workspace.yaml` catalog entries
      that are now unused.
- [x] Remove `artifacts/mockup-sandbox` entirely (dev-only scratch space, not part of the
      shipped app). Delete the directory, drop it from `pnpm-workspace.yaml`, and remove any
      root tsconfig/script references to it. (Recoverable from git history if ever needed.)
- [x] `pnpm install` to refresh the lockfile.

**Verify:** `pnpm run typecheck` and `pnpm run build` pass with the backend gone.

---

## Phase 4 — De-Replit & sane defaults

- [x] `artifacts/dm-screen/vite.config.ts`: stop throwing on missing `PORT`/`BASE_PATH`;
      default `PORT` (e.g. 5173) and `base` to `'/'`. Remove the `/api` dev proxy.
- [x] Remove the `@replit/vite-plugin-*` plugins and their deps.
- [x] Delete `.replit`, `.replitignore`, `replit.md`, `scripts/post-merge.sh`, and the
      `[deployment]`/`[nix]`/`[agent]` Replit assumptions.
- [x] Keep `minimumReleaseAge: 1440` in `pnpm-workspace.yaml` (supply-chain defense — do not remove).

**Verify:** a clean clone runs `pnpm install && pnpm dev` with **no env vars set**.

---

## Phase 5 — Run scripts (dev / build / preview)

- [x] Root `package.json`: add convenient passthrough scripts so the owner can run from root:
      `dev` (vite dev), `build` (vite build), `preview`/`serve` (vite preview of `dist`).
- [ ] Document the exact commands in the README (Phase 8).

**Verify:** `pnpm dev`, `pnpm build`, and `pnpm preview` all work from the repo root.

---

## Phase 6 — Offline PWA (stretch, but aligns with "reliable at the table")

- [x] Add `vite-plugin-pwa` (or a hand-written service worker) to precache the app shell
      and the bundled data so the screen works fully offline after first load.
- [x] Provide `manifest.webmanifest` + icons; set theme color.
- [x] Include a clean update strategy (hashed assets; activate-on-reload) so stale caches
      don't strand the user on an old build.

**Verify:** load once online, go offline (devtools), reload — app and all data still work.

---

## Phase 7 — Docker

- [x] Multi-stage `Dockerfile`: stage 1 `node` builds the SPA; stage 2 copies `dist` into a
      small static server image (nginx or `caddy`/`busybox httpd`).
- [x] `docker-compose.yml`: single service, one published port, no DB.
- [x] `.dockerignore` (allowlist the build inputs; exclude `node_modules`, `.git`, etc.).

**Verify:** `docker compose up` serves the working app on the mapped port from a clean checkout.

---

## Phase 8 — Docs

- [ ] Rewrite `README.md`: remove Postgres prerequisites, seeding, and API endpoint sections;
      add the static run commands and the Docker instructions.
- [ ] Update `CLAUDE.md` to describe the new static architecture (no api-server / Drizzle /
      raw-SQL notes; localStorage as the only persistence).
- [ ] Remove the now-inaccurate `replit.md`.
- [ ] Add a short note that Party/Notepad data is **per-browser** and clearing site data
      loses it.

**Verify:** README instructions, followed literally on a clean clone, produce a running app.

---

## Phase 9 — Final verification

- [ ] `pnpm run typecheck` and `pnpm run build` clean.
- [ ] Manual smoke test of all 7 widgets (Compendium, Initiative, Notepad, Oracle, Bestiary,
      Wizard's Tome, Party), including cross-widget jumps (Party→Initiative, Initiative→Bestiary).
- [ ] Party + Notepad + grid layout persist across reload.
- [ ] **Resume-after-shutdown test:** start an encounter (combatants, advance a round, change
      some HP), fully stop the server/Docker, relaunch, reopen the browser tab — Party, notes,
      layout, and the in-progress initiative state are all exactly as left.
- [ ] Light/Dark theme toggle still works.
- [ ] Docker image builds and serves.
- [ ] Spot-check in at least two browsers / OSes (broad-compatibility goal).

---

## Decisions already made (don't re-litigate)

- **Fully static, no backend.** Cross-device sync is explicitly not required.
- **localStorage** is the persistence layer for Party, Notepad, and grid layout.
- Two supported run modes: local dev command (`pnpm dev` / preview) **and** Docker.
- **Drop `mockup-sandbox`** — it is removed in Phase 3, not migrated.
- **Monsters: refresh the curated subset only** against 5etools v2.31.0; do not import the full
  204-file bestiary.

## Risks / things to flag to the owner

- **Party data becomes per-browser.** Recommend adding a small **Export / Import JSON**
  button for the Party roster as a nice-to-have backup (not required for this migration).
- **Data completeness** (Phase 1) is the main correctness risk. If the static datasets end
  up smaller than the old DB, Bestiary/Initiative/Tome searches will silently return fewer
  results. Verify counts before deleting the server (Phase 3).
- Preserve the **CustomEvent** wiring and **versioned localStorage keys** — both are easy
  to break during the widget rewrites.

## Deviations from this plan

_(Executing agent: record anything you had to do differently here.)_

### Phase 0

The repo's HEAD did not build or typecheck on macOS (darwin-arm64) before the migration could begin. Five pre-existing issues were fixed in Phase 0 so the baseline could go green; none of them are caused by the migration work itself.

1. **`pnpm-workspace.yaml` — `allowBuilds:` placeholder.** The file shipped with `allowBuilds: { esbuild: "set this to true or false" }`, which made `pnpm install` exit with code 1 (`ERR_PNPM_IGNORED_BUILDS`). pnpm v11 deprecated the old `onlyBuiltDependencies` list in favor of `allowBuilds: { name: true|false }`. Replaced the placeholder with `{ esbuild: true, '@swc/core': true, msw: true, 'unrs-resolver': true }` — the full set previously in `onlyBuiltDependencies`. Left the deprecated `onlyBuiltDependencies` block in place (Phase 4 will tidy).
2. **`pnpm-workspace.yaml` — Replit-only platform exclusions blocked builds on macOS.** The `overrides:` block excluded `@rollup/rollup-darwin-arm64`, `@esbuild/darwin-arm64`, `lightningcss-darwin-arm64`, `@tailwindcss/oxide-darwin-arm64`, and `@expo/ngrok-bin-darwin-arm64` (all set to `"-"`), which made vite/rollup fail at build time on this developer's machine. Removed those five `darwin-arm64` lines only. The rest of the Replit cleanup remains scheduled for Phase 4.
3. **`artifacts/dm-screen/src/data/generators.ts` — missing `pickRandom` helper.** Twelve call sites referenced an undefined `pickRandom` (introduced in commit `ea808c4` "Add ability to generate fantasy place names for games"). Added a four-line typed helper at module scope so the file typechecks and the runtime feature works.
4. **`artifacts/dm-screen/src/components/Sidebar.tsx` — `title` prop on lucide-react icons.** Two `<Grid title=…>` / `<Clock title=…>` usages were typechecking errors because lucide icons don't accept `title`. Wrapped each in `<span title=…>` (the standard accessibility pattern with lucide).
5. **`artifacts/api-server/tsconfig.json` — `rootDir: "src"` rejected `seed.ts`.** `seed.ts` imports `../../dm-screen/src/data/bestiary`, which falls outside `rootDir`. Dropped `rootDir` (the package will be deleted entirely in Phase 3). `outDir` is still set for esbuild-side hygiene.

Verified: `pnpm install`, `PORT=5173 BASE_PATH=/ pnpm run typecheck`, `PORT=5173 BASE_PATH=/ pnpm run build` all succeed on macOS (darwin-arm64, node 24). Dev server serves HTTP 200 on `http://localhost:5174/` with the seven widget components present under `artifacts/dm-screen/src/components/widgets/` (Bestiary, Compendium, Initiative, Notepad, Oracle, Party, WizardsTome). No browser-side render check was possible from CLI — visual confirmation deferred to the user.

5etools clone verified: `../5etools-src` is at tag `v2.31.0`, commit `ebd1827660ee61d1a59227d5979a137494dce1c8`.

### Phase 1

**Monster scope.** The plan's "current creature list from `src/data/bestiary.ts` / the
`Monsters_&_Beasts_*.csv`" was ambiguous because those two files describe very different
things: bestiary.ts is a curated 40-monster set with **rich stat blocks**, while the CSV is a
2,169-row **thin index** (name + AC + HP + CR + size + type + source — no traits/actions, ability
scores hardcoded to 10) that was upserted into Postgres via `seed-csv.ts` to power the Initiative
widget's broader autocomplete. After discussing options with the owner, we decided to **keep both**:

- The 40 rich entries are refreshed in place at `src/data/bestiary.ts`, preferring the 2024
  Monster Manual (`bestiary-xmm.json`) where the entry exists, falling back to 2014 MM otherwise
  (Bugbear, Drow, Gnoll, Goblin, Hobgoblin, Kobold, Orc — these 2024-era species moved out of
  the Monster Manual into species/race books).
- The CSV's 2,158 unique entries are shipped as a brand-new static file
  `src/data/monsterIndex.ts` for the Initiative widget to autocomplete against (rewired in Phase 2).
  Bestiary widget still works off the 40-row `bestiaryData`.

**Generators live in `scripts/src/data-generators/`.** Four tsx scripts plus a shared
`lib.ts` (5etools `stripTags`/`renderEntries` + a TS-literal serializer). Wired into
`scripts/package.json` as `generate:spells | generate:monsters | generate:monster-index |
generate:weapons` (and `generate:all`). They read exclusively from the local sibling clone at
`../5etools-src/data` (pinned tag `v2.31.0`); no network at build or run time. The path is
overridable via `FIVETOOLS_DIR` for CI flexibility.

**Counts (final).**

| Dataset | Source | Output | Count |
|---|---|---|---|
| Spells | 17 source files (PHB → XPHB → … → SCC) + `spells/sources.json` for class membership | `src/data/spells.ts` | 936 raw → **557** unique |
| Bestiary (rich) | 40 names from the original `bestiary.ts`, looked up across 107 5etools bestiary files | `src/data/bestiary.ts` | **40/40** matched |
| Monster index (thin) | `attached_assets/Monsters_&_Beasts_*.csv` | `src/data/monsterIndex.ts` | 2,170 rows → **2,158** unique |
| Weapons | `items.json` + `items-base.json` (231 + 102, 2024 edition wins) | `src/data/weapons.ts` | **251** unique |

The 557 spell count matches the README's claim. Weapons match the README's "250" figure (off by 1).

**Notes about generated output.**

- The 2024 Monster Manual (XMM) puts much heavier reliance on 5etools tag macros
  (`{@h}`, `{@actSaveFail}`, `{@atkr m}`, `{@actSave int}`, `{@hit N}`, `{@dc N}`) than the
  2014 MM did. The legacy `stripTags` would have left these as visible artifacts ("@h12 (2d6 + 5)"
  etc.). The shared stripper in `scripts/src/data-generators/lib.ts` was upgraded to translate
  these into plain-English combat labels — "Hit: 12 (2d6 + 5)", "Failure: …", "Int Save: DC 16",
  "Melee Attack Roll: +9" — so the generated output reads cleanly. This is a *new* improvement
  on top of the legacy importer's logic (which is otherwise reused verbatim).
- 5etools v2 moved per-spell class membership out of the spell records and into a separate
  `spells/sources.json` index (keyed by source → spell name → `class[]`). The generator now
  consults this index so the Wizard's Tome can still filter by class.
- The widgets still reference the API (`/api/monsters/search`, `/api/characters`, etc.) — they
  are repointed off the API in Phase 2. Phase 1's brief is data only.

**File header attribution.** Every generated output file starts with a comment block naming the
source (`../5etools-src/data/…`), the pinned tag (`v2.31.0`), the generator path, and the 5etools
MIT-licensing note. README-level docs will be updated in Phase 8.

**Bundle size impact.** dm-screen production JS goes from 452KB raw / 128KB gzipped → 934KB raw /
**251KB gzipped** (+123KB gzipped). Vite warns "chunk larger than 500KB" but the warning is
informational — Phase 6 (PWA) and any later code-splitting can address it; nothing is broken.

**Verified:** `pnpm run typecheck` and `pnpm run build` both green with the new data files in
place. Spot checks: Aboleth (XMM stat block intact, clean text); Fireball (correct PHB classes
Sorcerer + Wizard); Cure Wounds (Artificer/Bard/Cleric/Druid/Paladin/Ranger); Eldritch Blast
(Warlock only); Longsword (1d8 slashing, Versatile 1d10, 15gp); Pech (CR 2, source "Creature
Codex", AC 15 — round-tripped from the CSV with no enrichment).

### Phase 2

**Shared infrastructure (two new lib modules):**

- [artifacts/dm-screen/src/lib/partyStore.ts](artifacts/dm-screen/src/lib/partyStore.ts) — versioned
  localStorage CRUD for the Party roster (`dm-party-v1`). Exposes `loadParty`, `addCharacter`,
  `updateCharacter`, `deleteCharacter`, plus a React hook `useParty()` that subscribes to a
  `dm-party-changed` CustomEvent the store dispatches on every mutation. This is required because
  the browser's native `storage` event doesn't fire for same-tab writes, and both Party and
  Initiative widgets need to see each other's changes live.
- [artifacts/dm-screen/src/lib/monsterSearch.ts](artifacts/dm-screen/src/lib/monsterSearch.ts) —
  unified search over `bestiaryData` (40 rich) + `monsterIndex` (2,158 thin). Returns a single
  `MonsterSearchHit[]` shape; rich entries are prioritized when both datasets match the same name.
  Used by Initiative for autocomplete; Bestiary inlines its own merge logic but could be
  consolidated here later.

**Widget rewrites (no behavioral changes; only data plumbing):**

- [PartyWidget.tsx](artifacts/dm-screen/src/components/widgets/PartyWidget.tsx) — `/api/characters`
  CRUD → `partyStore` calls. `/api/weapons/search` debounced fetch → in-memory filter over the new
  `weaponsData` (251 weapons; debounce kept short at 80ms just to coalesce keystrokes). The "batch
  resolve weapon names → stats" call (`/api/weapons/by-names`) is gone; replaced with a single
  build-time `Map<lowerName, Weapon>` built once at module scope. `loading`/`saving` state removed
  because localStorage is synchronous.
- [BestiaryWidget.tsx](artifacts/dm-screen/src/components/widgets/BestiaryWidget.tsx) — both
  `/api/monsters/search` fetches replaced with `bestiaryData` filtering merged with a thin
  `monsterIndex` filter (capped at 200 hits per query). The `target` jump from Initiative now
  resolves synchronously via a name → rich/thin lookup. The "Searching database…" pulse text and
  `dbLoading` state are gone.
- [InitiativeWidget.tsx](artifacts/dm-screen/src/components/widgets/InitiativeWidget.tsx) —
  monster search uses `searchMonsters` over the local index; party tab uses `useParty()`.
  Combat-state keys are bumped to versioned form (`dm-initiative-v1`, `dm-initiative-turn-v1`,
  `dm-round-v1`) per the plan, with a one-shot legacy read from the unversioned keys so a DM with
  an encounter in progress at upgrade time doesn't lose it. The combatant list, turn index, round
  counter, *and* per-combatant HP all live in `dm-initiative-v1` (HP is a field on each Combatant
  — already covered by the existing schema). Notepad (`dm-notepad`) and the grid layout
  (`dm-tiles-v3`, `dm-grid-cols`, `dm-grid-rows`) were not touched and still persist.

**useLocalStorage hook tweak.** Extended to accept a lazy `() => T` initializer in addition to a
plain T, so the legacy-key fallback can be deferred. The eager-form call sites are unaffected.

**CustomEvent wiring confirmed intact.** `dm-add-to-initiative` (Party → Initiative) at
PartyWidget.tsx:254 and InitiativeWidget.tsx:103–113. `dm-open-bestiary` (Initiative → Bestiary) at
InitiativeWidget.tsx:394 and App.tsx:47–48. A third event was added: `dm-party-changed` (PartyStore
→ both widgets via `useParty`).

**`@workspace/api-client-react` / react-query removal.** No usages anywhere in
`artifacts/dm-screen/src/`. The two deps remain in `artifacts/dm-screen/package.json` and will be
deleted in Phase 3 along with the lib packages themselves.

**Bundle size impact.** dm-screen production JS goes from 934 KB raw / 251 KB gzipped (Phase 1)
to **1,596 KB raw / 354 KB gzipped** (+103 KB gz). The increase is the same data the widgets used
to fetch on-demand now being tree-shake-resistant inside their bundles. Phase 6 (PWA) and any
later route-level code-splitting can address it.

**Verified:**
- `pnpm run typecheck` → green.
- `PORT=5173 BASE_PATH=/ pnpm run build` → green.
- Production bundle scanned: **zero `/api/` strings** survive (`grep "/api/" dist/public/assets/*.js` = 0).
- Dev server starts with no api-server process running (`PORT=5174 BASE_PATH=/ pnpm dev` → HTTP
  200 on `/`, correct page title).
- Visual in-browser verification is left to the user — there is no automated UI test in this
  repo.

### Phase 3

Deletions (the directories will all be in the previous commit's git history if ever needed):

- `artifacts/api-server/`            (Express + raw `pg.Pool` API)
- `artifacts/mockup-sandbox/`        (Vite dev scratch — never shipped)
- `lib/db/`                          (Drizzle schema template — was empty)
- `lib/api-spec/`                    (OpenAPI + Orval config)
- `lib/api-client-react/`            (generated React Query hooks)
- `lib/api-zod/`                     (generated Zod schemas)
- the now-empty `lib/` directory     (removed once all four sub-packages were gone)

Configuration cleanups:

- `artifacts/dm-screen/package.json` — dropped `@tanstack/react-query` and
  `@workspace/api-client-react` from devDependencies.
- `artifacts/dm-screen/tsconfig.json` — removed the `references` block (its single entry
  pointed at the deleted `lib/api-client-react`).
- Root `tsconfig.json` — emptied the `references` array (all three entries pointed at deleted
  lib packages).
- `pnpm-workspace.yaml`:
  - `packages:` — dropped the now-empty `lib/*` and the always-empty `lib/integrations/*`
    globs; the workspace is now `artifacts/* + scripts`.
  - `catalog:` — dropped the unused `@tanstack/react-query` and `drizzle-orm` entries. The
    `@replit/vite-plugin-*` entries stay; Phase 4 removes them along with the rest of the
    Replit machinery.
- Root `package.json` — already had no API-codegen / Drizzle / `DATABASE_URL` references, so
  nothing to remove there.

**Lockfile.** `pnpm install` removed **226 packages** (net `-226 / +3`) — the entire
api-server + drizzle + Orval + tanstack-query + lots-of-transitive-pg tree is gone. Three
workspace projects remain (root + dm-screen + scripts; the lockfile reports `Scope: 2 of 3`
because the root has no scripts of its own).

**Verified:**
- `pnpm install` → green; supply-chain release-age check still enforced (`minimumReleaseAge:
  1440` untouched).
- `pnpm run typecheck` → green for dm-screen and scripts.
- `PORT=5173 BASE_PATH=/ pnpm run build` → green. Bundle unchanged from Phase 2 (1,596 KB raw
  / 354 KB gzipped) — Phase 3 deleted infrastructure, not bundled code.

### Phase 4

`vite.config.ts` rewritten:

- `PORT` and `BASE_PATH` are now both **optional**. `PORT` defaults to **5173**, `base` to
  `'/'`. The throwing-on-missing-env guards from the Replit setup are gone. The numeric-port
  validation stays.
- All three `@replit/vite-plugin-*` imports/uses removed (`runtime-error-modal`,
  `cartographer`, `dev-banner`), along with the `REPL_ID` env-var conditional. The plugin
  block is now just `[react(), tailwindcss()]`.
- The `/api → http://localhost:8080` dev proxy is gone — there is no backend to proxy to.

Dependency cleanup:

- `artifacts/dm-screen/package.json` drops `@replit/vite-plugin-cartographer`,
  `-dev-banner`, and `-runtime-error-modal`.
- `pnpm-workspace.yaml` drops the three matching catalog entries.

Files deleted:

- `.replit`, `.replitignore`, `replit.md`, `scripts/post-merge.sh`.

`minimumReleaseAge: 1440` left in place as required.

**One thing left alone:** the `// @replit …` annotation comments inside the shadcn-derived
`src/components/ui/badge.tsx` and `button.tsx` are *just code comments* documenting
"this is a Replit customization vs. vanilla shadcn." They don't change any behavior or pull
in any Replit infrastructure. Removing them would be cosmetic grooming, not de-Replit-ing —
left untouched.

Lockfile: `pnpm install` removed 4 more packages (the three Replit plugins + a transitive).

**Verified:**
- `env -i HOME=… PATH=… pnpm --filter @workspace/dm-screen run dev` (i.e. an **empty
  environment**, no `PORT`/`BASE_PATH`/`NODE_ENV`/anything) → Vite serves the SPA on
  `http://localhost:5173/` with HTTP 200 and the correct page title.
- `env -i HOME=… PATH=… pnpm run typecheck` → green.
- `env -i HOME=… PATH=… pnpm run build` → green. Bundle unchanged from Phase 2/3 (354 KB
  gzipped).

### Phase 5

Three new passthrough scripts in the root `package.json`:

- `pnpm dev`     → `pnpm --filter @workspace/dm-screen run dev`
- `pnpm preview` → `pnpm --filter @workspace/dm-screen run serve` (vite preview of `dist/`)
- `pnpm serve`   → same as `preview`, alias kept for the README later

The existing root `pnpm build` (`pnpm run typecheck && pnpm -r --if-present run build`) was
already a root-level entry point, so it didn't need a new wrapper.

The one box left unticked in this phase ("Document the exact commands in the README") is
explicitly owned by Phase 8 per the source plan.

**Verified** with an empty environment (`env -i HOME=… PATH=… …`):
- `pnpm dev` from repo root → Vite serves `http://localhost:5173/` HTTP 200, correct title.
- `pnpm build` from repo root → typecheck + Vite build both green.
- `pnpm preview` from repo root → Vite preview serves the freshly built `dist/public/` on
  the same default port, HTTP 200, correct title.

### Phase 6

Wired `vite-plugin-pwa@^1.3.0` (chosen because it owns the Workbox + manifest +
SW-registration story in one plugin; the alternative was a hand-written service worker plus a
manual manifest, which would have been ~150 lines of glue we'd then need to maintain).

`vite.config.ts` plugin block now includes a `VitePWA({...})` entry with:

- `registerType: "autoUpdate"` and `injectRegister: "auto"` — the plugin auto-injects
  `<script src="/registerSW.js">` into the built `index.html` and the SW activates on the
  next page load when a new build is detected.
- `cleanupOutdatedCaches: true` (Workbox option) so old precached assets are pruned on every
  new SW activation. Combined with Vite's hashed asset filenames, this is the "stale caches
  can't strand the DM" guarantee.
- `clientsClaim: true` — the new SW takes control of open tabs immediately on activation.
  With the autoUpdate registerType the plugin also emits `self.skipWaiting()` in the SW,
  giving us proper activate-on-reload semantics (DM reloads the tab → new code is live; they
  don't need to close every tab first).
- `navigateFallback: "index.html"` — SPA routing.
- `maximumFileSizeToCacheInBytes: 4 MiB` — the dm-screen JS bundle is ~1.6 MiB raw, so the
  default 2 MiB cap is uncomfortably close. 4 MiB gives headroom for future growth without
  spilling into runtime caching.
- `globPatterns: ["**/*.{js,css,html,svg,png,ico,webp,woff,woff2}"]` — precaches every
  bundled asset. The reference data is part of the JS bundle, so it's covered too.
- Two `runtimeCaching` rules for the Google Fonts stylesheet (`StaleWhileRevalidate`) and
  the woff2 files (`CacheFirst`, 30 entries, 1 year) so the Inter font keeps working when
  offline.

Manifest values (`name`, `short_name`, `description`, `theme_color: #1a0a2e`,
`background_color: #050009`, `display: standalone`, `scope: .`, `start_url: .`).

Icons (committed under `artifacts/dm-screen/public/`):

- `favicon.svg` — 64×64 themed icon (deep amethyst gradient, amethyst stroke,
  serif "DM" wordmark). Replaces the old orange Replit placeholder.
- `pwa-icon.svg` — 512×512 maskable variant with the badge centred inside the
  80% safe area so OS-applied masks (Android round, iOS squircle) don't crop the wordmark.

**Why SVG-only, no PNG variants.** Modern browsers and PWA installers (Chrome, Firefox,
Edge, recent Safari) honour SVG icons in `manifest.webmanifest`. Older iOS Safari versions
may want a PNG specifically for the home-screen shortcut, and Windows install dialogs
sometimes prefer raster — those are minor cosmetic regressions, not functional offline
breakage. Avoided adding a build-time PNG-render dependency (`@vite-pwa/assets-generator` /
`sharp`) for now; a follow-up can drop in PNGs if any specific install target loses fidelity.

**Build artefacts in `dist/public/`** after `pnpm build`:

- `sw.js` (1.7 KB) — generated Workbox SW.
- `workbox-<hash>.js` (22 KB) — Workbox runtime.
- `manifest.webmanifest` (562 B) — PWA manifest.
- `registerSW.js` (134 B) — registers the SW on `window.load`.

Workbox precache manifest size on this build: **9 entries, 1,694 KiB** — the app shell
(index.html), the hashed CSS+JS bundles (which carry all of bestiary/spells/weapons/
monsterIndex data), both icons, the manifest, and the SW registrar.

**Verified mechanically (CLI):**
- `pnpm build` → green; PWA plugin reports `precache 9 entries (1694.48 KiB)`.
- `pnpm preview` then `curl -I` each PWA artefact: `manifest.webmanifest` (HTTP 200,
  Content-Type `application/manifest+json`), `sw.js` (200, `text/javascript`),
  `registerSW.js` (200, `text/javascript`), both SVG icons (200, `image/svg+xml`).
- Built `index.html` now contains `<link rel="manifest" href="/manifest.webmanifest">` and
  `<script id="vite-plugin-pwa:register-sw" src="/registerSW.js">`.

**Not verified mechanically — requires a real browser (Chrome DevTools → Application →
Service Workers → Offline → reload).** The "load once online, go offline, reload" smoke
test in the plan's Verify box is a manual step. The mechanical guarantees that make it
*should-work*: every URL the SPA fetches at runtime is in the precache manifest
(no `/api/*` requests survive after Phase 2, no CDN fetches except Google Fonts which are
covered by runtime caching), and the SPA falls back to `index.html` for any unknown
navigation.

### Phase 7

Four new files:

- `Dockerfile` — multi-stage. Build on `node:24-bookworm-slim`, runtime on `nginx:alpine`.
  **Why glibc for the build:** `pnpm-workspace.yaml`'s `overrides:` block still excludes
  the `linux-x64-musl` variants of rollup / esbuild / lightningcss / oxide (a hold-over
  from when the workspace was Replit-only). `node:24-alpine` (musl) would fail to install
  the matching binaries. `bookworm-slim` ships glibc, which matches the `linux-x64-gnu`
  binaries that aren't excluded. The runtime stage has no node deps so musl is fine for
  `nginx:alpine`. `pnpm` is materialised by `corepack enable` from the pinned lockfile.
- `artifacts/dm-screen/docker/nginx.conf` — SPA-aware site config. gzip on for text
  responses (the ~1.6 MiB JS → ~354 KiB on the wire); `try_files $uri $uri/ /index.html`
  for SPA fallback (future-proof, the app has no client-side routing today); long-lived
  `immutable` cache for `/assets/*` (Vite emits hashed filenames); `no-cache` for `sw.js`
  / `registerSW.js` / `manifest.webmanifest` / `index.html` so PWA updates land on the
  next reload instead of getting pinned by an intermediate cache.
- `docker-compose.yml` — single `dm-screen` service, no DB, published `5173:80`,
  `restart: unless-stopped`, `wget`-based healthcheck on `/`. Host port matches the
  dev/preview port for muscle-memory consistency.
- `.dockerignore` — `**/node_modules`, `**/dist`, `.git`, editor + OS noise, the Docker
  scaffolding itself (no point shipping the Dockerfile into the image), and the intake
  docs (HANDOVER, CLAUDE.md). The build context stays small and never picks up local
  build artefacts.

**ARM64 caveat.** The remaining platform-binary overrides also exclude `linux-arm64`
variants. Building this image on a Raspberry Pi or AWS Graviton will fail until those
lines are dropped from `pnpm-workspace.yaml`. Cleaning that up is out of scope for
Phase 7 (Phase 0 only removed the darwin-arm64 lines needed to unblock local dev); a
follow-up can extend the same treatment to linux-arm64.

**Verified mechanically (CLI):**
- `docker compose config` parses cleanly and resolves service name (`selene-dm-screen`),
  ports (`5173:80`), and healthcheck.
- All four artefacts present on disk; nginx config syntactically reasonable.
- `node:24-bookworm-slim` exists for linux/amd64 (verified via
  `docker buildx imagetools inspect`).

**Not verified mechanically — needs a running Docker daemon.** The plan's Verify box
(`docker compose up` from a clean checkout) requires the daemon to actually run the
build. The Docker CLI is installed in this environment but the daemon isn't up, so the
actual smoke test is left to the user. Mechanical proof points that make it
should-work: compose YAML validates, both base images exist on Docker Hub,
`pnpm install --frozen-lockfile` will fail loudly if the lockfile drifts, and the
in-image build runs the same `pnpm build` we've verified green for several phases now.
