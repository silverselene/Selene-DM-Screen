# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

pnpm-workspace monorepo for **Selene's DM Screen**, a browser-based D&D 5.5e (2024) Dungeon Master dashboard. **One** deployable artifact (a static SPA) plus an offline data-generator package. No backend, no database, no environment variables required.

History: this used to be a three-tier app (React + Express + PostgreSQL on Replit). The migration to a fully static, self-hostable SPA is documented in [HANDOVER-self-hosting.md](HANDOVER-self-hosting.md) — that file is the source of truth for *why* things are the way they are. Anything pre-migration (the API server, Drizzle, the OpenAPI/Orval codegen, the mockup sandbox, Replit infra) has been deleted; if you find references to them in old commits or comments, they're historical.

## No required environment variables

The app runs from a clean clone with `pnpm install && pnpm dev` and zero env vars. `vite.config.ts` defaults `PORT` to `5173` and `base` to `'/'`.

## Commands

Always use `pnpm` — the root `preinstall` script rejects npm/yarn.

```bash
# Install
pnpm install

# Dev / build / preview (all from the repo root)
pnpm dev          # Vite dev server on http://localhost:5173
pnpm build        # typecheck + vite build → artifacts/dm-screen/dist/public/
pnpm preview      # vite preview of the built bundle

# Typecheck only
pnpm typecheck                                       # whole workspace, project-references-aware
pnpm --filter @workspace/dm-screen run typecheck     # single package

# Regenerate bundled reference data from the local ../5etools-src clone (tag v2.31.0)
pnpm --filter @workspace/scripts run generate:all
# Or individually:
pnpm --filter @workspace/scripts run generate:spells
pnpm --filter @workspace/scripts run generate:monsters
pnpm --filter @workspace/scripts run generate:monster-index
pnpm --filter @workspace/scripts run generate:weapons

# Docker
docker compose up --build                            # http://localhost:5173 (host) → 8080 (non-root nginx container)
```

There is no test runner configured in this repo. Verification is manual + the production build + bundle scans (e.g. `grep "/api/" dist/public/assets/*.js` must return zero).

## Repository layout

```
artifacts/
  dm-screen/                  React 19 + Vite + Tailwind v4 — the only deployable
    src/data/                 Bundled reference data (spells, bestiary, monsterIndex, weapons, …)
    src/lib/                  localStorage stores, backup/restore, shared UI primitives
    src/components/widgets/   The seven widgets
    public/                   PWA icons + static assets
    docker/nginx.conf         SPA-aware nginx config used by the Docker image
scripts/                      Standalone tsx data generators (offline, read from ../5etools-src)
attached_assets/              Source CSV for the 2,158-row monster index
Dockerfile, docker-compose.yml, .dockerignore
HANDOVER-self-hosting.md      Migration log + per-phase deviations
```

## TypeScript / project references

Every package extends `tsconfig.base.json` (`composite: true`, `moduleResolution: "bundler"`, `customConditions: ["workspace"]`). The root `tsconfig.json` currently has an empty `references` array — all the old `lib/*` packages are gone.

- Typecheck from the root so workspace cross-references resolve. `pnpm --filter ... run typecheck` also works because each package declares its own references.
- If you ever re-introduce a workspace library, add `{ "path": "..." }` to the importing package's `tsconfig.json` `references` array and to the root `tsconfig.json`.
- `tsc` is only for type-checking and `.d.ts` emission. Bundling is handled by Vite.

## Frontend architecture (dm-screen)

- Path alias: `@/* → src/*` and `@assets/* → ../../attached_assets/*`.
- shadcn/ui (style: `new-york`) lives in `src/components/ui/`; do not hand-edit those — re-add via the shadcn CLI.
- **All state lives in `localStorage`** via the generic `useLocalStorage` hook or one of the typed stores under `src/lib/` (`partyStore.ts`, `backup.ts`).
  - Keys are **versioned** (e.g. `dm-tiles-v3`, `dm-party-v1`, `dm-initiative-v1`). **Bump the version suffix whenever the stored shape changes** to avoid corrupt-state crashes on load. When you need to migrate users with in-progress state on the old key, add a one-shot, idempotent migration to [migrations.ts](artifacts/dm-screen/src/lib/migrations.ts) and call it from `runMigrationsOnce()`, which [main.tsx](artifacts/dm-screen/src/main.tsx) invokes **before** `createRoot(...).render(<App/>)` (see `migrateLegacyInitiativeKeys`): copy legacy → versioned only if the versioned key is empty (treat both `null` and the string `"null"` as empty), then `removeItem(legacy)` on a successful copy. **Do not put migrations in a widget's module-load IIFE** — the widgets are lazy-loaded (see below), so a migration there would not run until the DM first mounts that widget, after `useLocalStorage` has already read its initial value. Pair the migration with a `legacyInitialValue(...)` factory passed to `useLocalStorage` so a failed `setItem` (quota / private mode) still surfaces the legacy data on read instead of falling back to defaults.
  - Every key uses the `dm-` prefix so the full-backup sweep in `src/lib/backup.ts` picks it up automatically — no central registry to update.
  - Persisted state includes the in-progress Initiative tracker (combatant list, turn order, current round, per-combatant HP) so the DM can stop the server / Docker mid-encounter and resume intact.
- **Cross-widget communication uses DOM CustomEvents on `window`**, not React context. Examples:
  - `dm-add-to-initiative` (Party → Initiative)
  - `dm-open-bestiary` (Initiative → Bestiary, listened to in [App.tsx](artifacts/dm-screen/src/App.tsx))
  - `dm-party-changed` (PartyStore → both Party and Initiative widgets — required because the browser's native `storage` event doesn't fire for same-tab writes)
  Search `window.dispatchEvent` / `addEventListener` to find the wiring. **Preserve this pattern** — don't refactor to context/props.
- The grid (configurable 2–4 × 2–4) supports `colSpan` / `rowSpan` of 1 or 2; tiles spanned over are stored as `null` in the tiles array. Read [App.tsx](artifacts/dm-screen/src/App.tsx) before changing tile-resize logic — the `null` placeholders are easy to break. The grid wrapper has `minHeight: 0; minWidth: 0; overflow: hidden` to prevent tall widgets from pushing the row past its `1fr` track.
- Theme is dark by default with a light "Midnight & Amethyst" alternate driven by the `light-mode` class on the root. CSS variables (`--dm-bg-page`, `--dm-t3`, ...) live in `src/index.css`.
- Anchored dropdowns (autocomplete suggestion lists, comboboxes) portal via `src/lib/AnchoredDropdown.tsx` so they escape each tile's `overflow: hidden`.
- **Widgets are `React.lazy`-loaded per tile** in [DMTile.tsx](artifacts/dm-screen/src/components/DMTile.tsx) so each widget's code (and the big reference datasets it pulls in) downloads on first mount, not at app boot. Each widget renders inside a `<Suspense>` **and** an [`ErrorBoundary`](artifacts/dm-screen/src/lib/ErrorBoundary.tsx) — `Suspense` only covers the *pending* chunk; the boundary catches a *rejected* dynamic import (stale hash after a redeploy with `cleanupOutdatedCaches`, or a network drop before the SW precache finishes) so a failed chunk fetch shows a per-tile "Reload app" fallback instead of blanking the whole dashboard. Keep both wrappers when adding a widget. Boot-time work that every widget depends on (e.g. localStorage migrations) must live in `main.tsx`, **not** a widget module, because lazy widgets evaluate late.

## Bundled reference data

| Dataset | File | Count | Source |
|---|---|---|---|
| Spells | `src/data/spells.ts` | 557 | 5etools `data/spells/*.json` + `sources.json` |
| Bestiary (rich) | `src/data/bestiary.ts` | 40 | 5etools `data/bestiary/*.json` (XMM > MM) |
| Monster index (thin) | `src/data/monsterIndex.ts` | 2,158 | `attached_assets/Monsters_&_Beasts_*.csv` |
| Weapons | `src/data/weapons.ts` | 251 | 5etools `data/items.json` + `items-base.json` (2024 wins) |
| Compendium / Oracle / generators | `src/data/{compendium,generators,playerOptions}.ts` | — | hand-curated |

All datasets are **bundled at build time** — no network at runtime. Generators live in `scripts/src/data-generators/` and read **only** from a local sibling clone at `../5etools-src` pinned to tag `v2.31.0` (overridable via `FIVETOOLS_DIR`). When regenerating:

- Prefer 2024 sources (XPHB, XMM) over 2014 (PHB, MM) — the strippers and source-priority lists already encode this.
- The shared `stripTags` in `scripts/src/data-generators/lib.ts` translates 5etools tag macros (`{@h}`, `{@actSaveFail}`, `{@hit N}`, `{@dc N}`, `{@damage}`, `{@scaledice}`, …) into plain-English combat labels. Extend it there, not in individual generators.
- File headers preserve 5etools MIT attribution. Keep them.

## PWA / service worker

The app is a PWA via `vite-plugin-pwa` configured in `vite.config.ts`:

- `registerType: "autoUpdate"` + `clientsClaim: true` + `skipWaiting` (implicit) — new SW takes over open tabs on next page load.
- `cleanupOutdatedCaches: true` + Vite's hashed asset filenames = stale caches can't strand the DM.
- `navigateFallback: "index.html"` for SPA routing.
- `maximumFileSizeToCacheInBytes: 4 MiB` (the JS bundle is ~1.6 MiB raw; default 2 MiB cap was uncomfortably close).
- `globPatterns` precaches `js, css, html, svg, png, ico, webp, woff, woff2`.
- Two `runtimeCaching` rules for Google Fonts (stylesheet StaleWhileRevalidate, woff2 CacheFirst).

The nginx config in `artifacts/dm-screen/docker/nginx.conf` sets `Cache-Control: no-cache` on `sw.js` / `registerSW.js` / `manifest.webmanifest` / `index.html` so PWA updates land on the next reload instead of being pinned by intermediate caches.

## Docker

- Multi-stage `Dockerfile`: build on `node:24-bookworm-slim` (glibc — must match the `linux-{x64,arm64}-gnu` native binaries), runtime on `nginxinc/nginx-unprivileged:alpine` (nginx runs as the non-root `nginx` user, so it listens on **8080**, not the privileged port 80). **Don't switch the build stage to `node:24-alpine`** — `pnpm-workspace.yaml`'s `overrides:` block still excludes the `-musl` rollup/esbuild/lightningcss/oxide variants. If you change the container port, update `nginx.conf`'s `listen`, the Dockerfile `EXPOSE`/`HEALTHCHECK`, and the compose `ports`/healthcheck together.
- `docker-compose.yml`: single service, no DB, publishes `5173:8080` (container listens on 8080). Host port matches the dev/preview port for muscle-memory consistency (and so localStorage is shared between dev and Docker on the same host).
- `.dockerignore` is an allowlist style for build inputs; never ship `node_modules`, `dist`, `.git`, or the intake docs into the image.
- Builds on ARM64 (Apple Silicon, Pi, Graviton) — the `linux-arm64-gnu` variants are explicitly **not** excluded.

## Security: npm minimum release age

[pnpm-workspace.yaml](pnpm-workspace.yaml) sets `minimumReleaseAge: 1440` (24 hours). This is a supply-chain attack defense and **must not be lowered or removed**. If a brand-new release is urgently needed, add it to a `minimumReleaseAgeExclude` allowlist and remove the exclusion once 24 hours have passed.

## Backup / restore

Two surfaces in `src/lib/`:

- `partyStore.ts` — `exportPartyAsJson` / `importPartyFromJson` (envelope `schema: "selene-dm-party"`, version 1). Wired into the Party widget header.
- `backup.ts` — `exportFullBackupAsJson` / `importFullBackupFromJson` (envelope `schema: "selene-dm-full"`, version 1). Sweeps every `dm-*` localStorage key — no registry to maintain. Wired into the sidebar BACKUP panel. Import wipes existing `dm-*` keys first then reloads the page so every widget initializes from the restored state cleanly.
