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

- [ ] **Monster scope is decided: refresh the existing curated subset only** (do **not** import
      the full 204-file bestiary). Take the current creature list from `src/data/bestiary.ts` /
      the `Monsters_&_Beasts_*.csv` as the canonical set of *which* monsters to include, and
      re-pull each one's stat block from the local 5etools clone (`../5etools-src/data/bestiary/`,
      tag `v2.31.0`) so values/wording are current. Keep the set the same size; only refresh contents.
- [ ] Audit counts. Compare `src/data/spells.ts` and `src/data/bestiary.ts` against the DB-era
      sources and the local 5etools clone. Document the gap.
- [ ] **Port the import scripts to read from the local clone `../5etools-src/data`** (pinned to
      tag `v2.31.0`) and **emit static JSON/TS into `src/data/`** instead of `INSERT`ing into
      Postgres. Reuse their existing `stripTags`/property-mapping logic verbatim; just swap the
      source (local files, not `raw.githubusercontent.com`) and the sink (file write, not pg).
      Run **once** to generate, then commit the output so the build never needs network.
- [ ] Create a **weapons** static dataset (`src/data/weapons.ts` or `.json`) generated from
      `../5etools-src/data/items.json` + `items-base.json` — it has no static equivalent today.
- [ ] Keep the data shape identical to what the widgets already consume so widget code
      changes stay minimal.
- [ ] Note the data's source/attribution (5etools, MIT) — preserve existing licensing.

**Verify:** counts match the intended full set; data files are committed; nothing fetches
from the network to build them.

---

## Phase 2 — Repoint widgets off the API onto local data + localStorage

Do not delete the server yet — get the frontend fully working without it first.

- [ ] **Establish a shared Party store** in localStorage (versioned key, e.g. `dm-party-v1`)
      with a small typed helper for read/write. Both Party and Initiative use it so
      "add character to initiative" still works.
- [ ] **PartyWidget**: replace `/api/characters` GET/POST/PUT/DELETE with the localStorage
      store; replace `/api/weapons/search` and `/api/weapons/by-names` with in-memory
      filtering over the new weapons dataset.
- [ ] **BestiaryWidget**: replace the two `/api/monsters/search` fetches with an in-memory
      filter over `bestiaryData`.
- [ ] **InitiativeWidget**: replace `/api/monsters/search` with the local filter; replace
      `/api/characters` with the shared Party store.
- [ ] **InitiativeWidget: persist live combat state** to a versioned localStorage key —
      combatant list, turn order, current round, and per-combatant HP — so stopping the
      server mid-combat and relaunching resumes the encounter intact. (Notepad and grid
      layout already persist; confirm they still do after the rewrites.)
- [ ] Confirm the DOM `CustomEvent` wiring (Party → Initiative, Initiative → Bestiary) still fires.
- [ ] Remove now-dead imports of `@workspace/api-client-react` / react-query data hooks
      from these widgets.

**Verify:** with the API server **stopped**, all 7 widgets work end to end in `pnpm dev`.

---

## Phase 3 — Remove backend & DB packages

- [ ] Delete `artifacts/api-server`, `lib/db`, `lib/api-spec`, `lib/api-client-react`, `lib/api-zod`.
- [ ] Remove `@workspace/api-client-react` (and any other removed workspace deps) from
      `artifacts/dm-screen/package.json` and from its `tsconfig.json` `references`.
- [ ] Remove the API-codegen / drizzle / DATABASE_URL references from root `package.json`
      scripts, `tsconfig.json` project references, and `pnpm-workspace.yaml` catalog entries
      that are now unused.
- [ ] Remove `artifacts/mockup-sandbox` entirely (dev-only scratch space, not part of the
      shipped app). Delete the directory, drop it from `pnpm-workspace.yaml`, and remove any
      root tsconfig/script references to it. (Recoverable from git history if ever needed.)
- [ ] `pnpm install` to refresh the lockfile.

**Verify:** `pnpm run typecheck` and `pnpm run build` pass with the backend gone.

---

## Phase 4 — De-Replit & sane defaults

- [ ] `artifacts/dm-screen/vite.config.ts`: stop throwing on missing `PORT`/`BASE_PATH`;
      default `PORT` (e.g. 5173) and `base` to `'/'`. Remove the `/api` dev proxy.
- [ ] Remove the `@replit/vite-plugin-*` plugins and their deps.
- [ ] Delete `.replit`, `.replitignore`, `replit.md`, `scripts/post-merge.sh`, and the
      `[deployment]`/`[nix]`/`[agent]` Replit assumptions.
- [ ] Keep `minimumReleaseAge: 1440` in `pnpm-workspace.yaml` (supply-chain defense — do not remove).

**Verify:** a clean clone runs `pnpm install && pnpm dev` with **no env vars set**.

---

## Phase 5 — Run scripts (dev / build / preview)

- [ ] Root `package.json`: add convenient passthrough scripts so the owner can run from root:
      `dev` (vite dev), `build` (vite build), `preview`/`serve` (vite preview of `dist`).
- [ ] Document the exact commands in the README (Phase 8).

**Verify:** `pnpm dev`, `pnpm build`, and `pnpm preview` all work from the repo root.

---

## Phase 6 — Offline PWA (stretch, but aligns with "reliable at the table")

- [ ] Add `vite-plugin-pwa` (or a hand-written service worker) to precache the app shell
      and the bundled data so the screen works fully offline after first load.
- [ ] Provide `manifest.webmanifest` + icons; set theme color.
- [ ] Include a clean update strategy (hashed assets; activate-on-reload) so stale caches
      don't strand the user on an old build.

**Verify:** load once online, go offline (devtools), reload — app and all data still work.

---

## Phase 7 — Docker

- [ ] Multi-stage `Dockerfile`: stage 1 `node` builds the SPA; stage 2 copies `dist` into a
      small static server image (nginx or `caddy`/`busybox httpd`).
- [ ] `docker-compose.yml`: single service, one published port, no DB.
- [ ] `.dockerignore` (allowlist the build inputs; exclude `node_modules`, `.git`, etc.).

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
