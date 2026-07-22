# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

pnpm-workspace monorepo for **Selene's DM Screen**, a browser-based D&D 5.5e (2024) Dungeon Master dashboard. **One** deployable artifact (a static SPA) plus an offline data-generator package. No backend, no database, no environment variables required. An **optional** local AI-bridge service (`services/ai-bridge`) and a shared types-only wire-contract package (`packages/bridge-protocol`) power the AI Chat widget; **neither is part of the deployable** — the SPA builds and runs without them (the widget stays usable for bundled-data lookups and shows a "bridge not running" banner over the chat).

History: this used to be a three-tier app (React + Express + PostgreSQL on Replit), migrated to a fully static, self-hostable SPA. Anything pre-migration (the API server, Drizzle, the OpenAPI/Orval codegen, the mockup sandbox, Replit infra) has been deleted; if you find references to them in old commits or comments, they're historical.

## No required environment variables

The app runs from a clean clone with `pnpm install && pnpm dev` and zero env vars. `vite.config.ts` defaults `PORT` to `38080` and `base` to `'/'`.

## Commands

Always use `pnpm` — the root `preinstall` script rejects npm/yarn.

```bash
# Install
pnpm install

# Dev / build / preview (all from the repo root)
pnpm dev          # SPA (:38080) + optional AI bridge (:38900) in parallel
pnpm dev:app      # SPA only (Vite dev server on http://localhost:38080)
pnpm dev:ai       # AI bridge only (services/ai-bridge; see its README)
pnpm build        # typecheck + vite build → artifacts/dm-screen/dist/public/
pnpm preview      # vite preview of the built bundle

# Typecheck only
pnpm typecheck                                       # whole workspace (incl. services/ai-bridge) — also runs each package's typecheck:tests
pnpm --filter @workspace/dm-screen run typecheck     # single package (src + config files)
# `pnpm build` runs `typecheck:deployable` (artifacts + scripts only) — NOT the
# bridge — because the Docker build image never installs the bridge's Agent-SDK
# deps. Use `pnpm typecheck` to type-check the bridge locally.
# dm-screen's `typecheck` covers src + the config files (vite.config.ts,
# vitest.config.ts) via tsconfig.node.json; its separate `typecheck:tests`
# (tsconfig.test.json) covers the *.test.ts(x) files. Root `pnpm typecheck`
# runs both; `typecheck:deployable`/`pnpm build` runs only the former, so a
# test type error fails CI but does not block a deploy.

# Tests (Vitest — dm-screen pure logic; Node env, no jsdom)
pnpm test                                            # all packages that define a test script
pnpm --filter @workspace/dm-screen run test          # single package (vitest run)
pnpm --filter @workspace/dm-screen run test:watch    # watch mode

# Regenerate bundled reference data from the local ../5etools-src (tag v2.31.0)
# and ../open5e-api (tag v1.12.0) clones
pnpm --filter @workspace/scripts run generate:all
# Or individually:
pnpm --filter @workspace/scripts run generate:spells
pnpm --filter @workspace/scripts run generate:monsters
pnpm --filter @workspace/scripts run generate:weapons
pnpm --filter @workspace/scripts run generate:compendium

# Docker
docker compose up --build                            # http://localhost:38080 (host) → 8080 (non-root nginx container)
```

**Testing.** Vitest is wired up for the dm-screen package ([vitest.config.ts](artifacts/dm-screen/vitest.config.ts)) and, since the AI-bridge work, for `services/ai-bridge` ([vitest.config.ts](services/ai-bridge/vitest.config.ts), Node-env / no-jsdom). The bridge suite spans both tiers: pure logic (tool-result parsers in `toolResults.ts`, config/origin validation, SSE framing in `sse.ts`, the smoke formatter) **and** real-socket HTTP lifecycle tests (`server.test.ts` binds ephemeral ports and drops sockets to exercise the wedge/timeout/backpressure/oversized-body paths) plus an SDK-mocking gate/mapping test (`agent.test.ts`) — the Agent SDK subprocess is always mocked, the HTTP server and sockets are real. Tests live beside the code as `*.test.ts` / `*.test.tsx`, excluded from the *deployable* program via `tsconfig.json`'s `**/*.test.ts(x)` globs so they don't leak into `pnpm build`'s typecheck — but they ARE type-checked: dm-screen runs `tsc -p tsconfig.test.json` under the `typecheck:tests` script (root `pnpm typecheck` invokes it; the ai-bridge/scripts packages' own `typecheck` already includes their tests since their tsconfigs have no test exclude). So a test asserting against a stale API shape now fails CI. The tsconfig `exclude` globs are wildcards, so a *new* test file needs no config change; only add to `exclude` if you introduce a differently-named test pattern.

Two tiers, and the default env is **`"node"`** — keep it that way:

- **Tier 1 — pure logic (the bulk).** dm-screen's `src/lib` (validators, id minting, backup/restore, the initiative add rules in `combatant.ts`) and the bridge's parsers. Runs in the plain Node env; storage-dependent tests install a fake `window.localStorage` per-test rather than pulling in jsdom.
- **Tier 2 — component tests, opt-in per file.** A `// @vitest-environment jsdom` docblock at the top of the file — **not** a global `test.environment` flip, which would tax every pure-logic file with a DOM setup it doesn't need. Currently one file: [InitiativeWidget.addPaths.test.tsx](artifacts/dm-screen/src/components/widgets/InitiativeWidget.addPaths.test.tsx), which guards that all four "add to initiative" paths converge on the shared rule — an invariant tier 1 structurally cannot see. Mock heavy data modules when you mount a widget (that file mocks `@/lib/monsterSearch`, since `src/data/monsters.ts` is 4.8 MB).

**jsdom is not a browser.** Its `window.confirm`/`alert` throw "Not implemented" (stub them; assert on message + effect, not that a modal blocked), it has no layout (`getBoundingClientRect` returns zeros, so the anchored-dropdown flip is out of reach), and it enforces no storage quota. Those, plus service-worker updates and file-picker dismissal, still need manual verification or Playwright coverage.

Full verification is `pnpm test` + `pnpm typecheck` + the production build + bundle scans (e.g. `grep "/api/" dist/public/assets/*.js` must return zero). New deps are subject to the `minimumReleaseAge: 1440` gate. Note that `vitest` takes an optional peer on `jsdom`, so adding/removing it re-hashes vitest's `.pnpm` path for **every** workspace project — run a full `pnpm install` (not a filtered one) afterward or the other packages' `vitest` symlinks dangle.

That same peer edge means `jsdom` is downloaded during the Docker build (which installs dm-screen's devDeps — it has to; `vite`/`typescript` live there). **Moving `jsdom` to the root `package.json` does not avoid this** and has been tried: dm-screen's vitest resolves to `vitest@4.1.9(…)(jsdom@29.1.1)(…)` regardless of which manifest declares jsdom, so the filtered install materializes the peer anyway. Test-only deps stay in the package whose tests import them; the build-image cost is accepted.

## Repository layout

```
artifacts/
  dm-screen/                  React 19 + Vite + Tailwind v4 — the only deployable
    src/data/                 Bundled reference data (spells, monsters, weapons, …)
    src/lib/                  localStorage stores, backup/restore, shared UI primitives
    src/components/widgets/   The nine widgets (AI Chat requires the optional bridge)
    public/                   PWA icons + static assets
    docker/nginx.conf         SPA-aware nginx config used by the Docker image
packages/
  bridge-protocol/            Shared, types-only wire contract for the AI bridge ⇄ AI Chat widget (no runtime code, no deps)
scripts/                      Standalone tsx data generators (offline, read from ../5etools-src)
services/
  ai-bridge/                  Optional local Claude Agent SDK + ddb-mcp bridge; NOT in the deployable (see its README)
attached_assets/              Source CSV for the 2,158-row monster index
Dockerfile, docker-compose.yml, .dockerignore
```

## TypeScript / project references

Every package extends `tsconfig.base.json` (`moduleResolution: "bundler"`, `customConditions: ["workspace"]`). The root `tsconfig.json`'s `references` array is empty — cross-package imports resolve through the **`workspace` export condition**, not TypeScript project references.

- **Shared workspace library:** `@workspace/bridge-protocol` (`packages/bridge-protocol`) is a types-only package holding the AI-bridge wire contract (`BridgeEvent`, `BridgeHealth`), imported by both `services/ai-bridge` and `artifacts/dm-screen` so a producer/consumer drift is a compile error. Its `package.json` `exports` maps the `workspace` condition straight to `src/index.ts` — no build step, no `.d.ts` emit. Both consumers `import type` from it, so it is **erased from every bundle** (verify: `grep -r bridge-protocol dist/public/assets` returns zero). Copy this pattern (expose the `workspace` export condition) rather than wiring `composite`/`references` if you add another shared package.
- Typecheck from the root so workspace cross-references resolve. `pnpm --filter ... run typecheck` also works; `pnpm typecheck:deployable` (used by `pnpm build`) covers only `artifacts/**` + `scripts` but still resolves the shared package's source through dm-screen.
- `tsc` is only for type-checking. Bundling is handled by Vite.

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
| Monsters | `src/data/monsters.ts` | 2,160 | `attached_assets/Monsters_&_Beasts_*.csv` + 5etools `data/bestiary/*.json` (XMM > MM) + Open5e `data/v1/{tob,cc,tob2,tob3,menagerie}/Monster.json` (OGL) |
| Weapons | `src/data/weapons.ts` | 251 | 5etools `data/items.json` + `items-base.json` (2024 wins) |
| Compendium (hand-curated) | `src/data/compendium.ts` | 78 | hand-curated DM summaries — never touched by a generator |
| Compendium (bulk rules) | `src/data/compendiumRules.ts` | 561 | 5etools `data/{feats,actions,skills,senses,variantrules}.json` + Open5e `data/v1/{a5e,toh,taldorei}/Feat.json` (OGL/CC-BY) |
| Oracle / generators | `src/data/{generators,playerOptions}.ts` | — | hand-curated |

`monsters.ts` is a single unified array (`MonsterEntry[]`): every entry carries the thin fields (name/ac/hp/cr/size/type/alignment/source/environment/pageNumber/isLegendary/initiative…), and 2,144 of the 2,160 (99.3%) additionally carry the rich fields (speed, ability scores, senses/languages, traits/actions/reactions/legendaryActions) — 40 from a hand-maintained curated list (`CANONICAL_RICH_NAMES` in `generate-monsters.ts`), the rest matched by name against 5etools (official WotC content) or Open5e (Kobold Press Tome of Beasts I–III / Creature Codex, Level Up A5e Monstrous Menagerie — Open Game Content under OGL, see [OGL-NOTICE.md](OGL-NOTICE.md)). The remaining 16 are custom/homebrew entries, adventure-specific variants with no match in either source, or third-party rows whose same-name candidates all failed the cross-source CR/type gate, and stay thin. Check `actions !== undefined` to tell a full stat block apart from a thin entry — see [monsterSearch.ts](artifacts/dm-screen/src/lib/monsterSearch.ts) and [BestiaryWidget.tsx](artifacts/dm-screen/src/components/widgets/BestiaryWidget.tsx).

The Compendium widget merges two data files at the widget layer (`CompendiumWidget.tsx`), not in a single generated array like `monsters.ts` — `compendium.ts` holds the DM's own hand-written rule summaries and is **never** touched by `generate-compendium.ts`; that generator only writes `compendiumRules.ts` (feats, combat actions, skills, senses, and DMG/PHB-style variant rules), skipping any entry whose (normalized) title already exists in `compendium.ts` so the DM's own wording always wins. `categories` for the filter dropdown is derived from the union of both arrays in the widget, not exported from either data file.

All datasets are **bundled at build time** — no network at runtime. Generators live in `scripts/src/data-generators/` and read **only** from local sibling clones: `../5etools-src` pinned to tag `v2.31.0` (overridable via `FIVETOOLS_DIR`), and, for `generate-monsters.ts`'s and `generate-compendium.ts`'s third-party passes, `../open5e-api` pinned to tag `v1.12.0` (overridable via `OPEN5E_DIR`). When regenerating:

- Prefer 2024 sources (XPHB, XMM) over 2014 (PHB, MM) — the strippers and source-priority lists already encode this.
- The shared `stripTags` in `scripts/src/data-generators/lib.ts` translates 5etools tag macros (`{@h}`, `{@actSaveFail}`, `{@hit N}`, `{@dc N}`, `{@damage}`, `{@scaledice}`, …) into plain-English combat labels. Extend it there, not in individual generators.
- File headers preserve 5etools MIT attribution and note the Open5e/OGL provenance where applicable. Keep them, and keep [OGL-NOTICE.md](OGL-NOTICE.md) in sync if you add another OGL-licensed source book.

## PWA / service worker

The app is a PWA via `vite-plugin-pwa` configured in `vite.config.ts`:

- `registerType: "autoUpdate"` + `clientsClaim: true` + `skipWaiting: true` — the coherent pair for `autoUpdate`: a freshly installed SW takes over open tabs on next page load.
- `injectRegister: "script"` — pinned (not `"auto"`) so a future plugin default-change can't reintroduce an inline registration and force the CSP `script-src` back open.
- `cleanupOutdatedCaches: true` + Vite's hashed asset filenames = stale caches can't strand the DM.
- `navigateFallback: "index.html"` for SPA routing.
- `build.rollupOptions.output.manualChunks` splits the big datasets into stable `data-spells` / `data-monsters` / `data-weapons` / `data-compendium-rules` chunks, and widgets are `React.lazy`-loaded per tile, so the main `index` chunk is ~237 kB and a widget edit no longer busts the dataset precache.
- `maximumFileSizeToCacheInBytes: 8 MiB` (headroom for the largest dataset chunk — `data-monsters` alone is ~4.1 MB now that most of the 2,160-row monster dataset carries a full stat block; default 2 MiB cap was uncomfortably close).
- `globPatterns` precaches `js, css, html, svg, png, jpg, jpeg, ico, webp, woff, woff2`.
- Two `runtimeCaching` rules for Google Fonts (stylesheet StaleWhileRevalidate, woff2 CacheFirst).

The nginx config in `artifacts/dm-screen/docker/nginx.conf` sets `Cache-Control: no-cache` on `sw.js` / `registerSW.js` / `manifest.webmanifest` / `index.html` so PWA updates land on the next reload instead of being pinned by intermediate caches.

## Docker

- Multi-stage `Dockerfile`: build on `node:24-bookworm-slim` (glibc — must match the `linux-{x64,arm64}-gnu` native binaries), runtime on `nginxinc/nginx-unprivileged:alpine` (nginx runs as the non-root `nginx` user, so it listens on **8080**, not the privileged port 80). **Don't switch the build stage to `node:24-alpine`** — `pnpm-workspace.yaml`'s `overrides:` block still excludes the `-musl` rollup/esbuild/lightningcss/oxide variants. If you change the container port, update `nginx.conf`'s `listen`, the Dockerfile `EXPOSE`/`HEALTHCHECK`, and the compose `ports`/healthcheck together.
- `docker-compose.yml`: single service, no DB, publishes `38080:8080` (container listens on 8080). Host port matches the dev/preview port for muscle-memory consistency (and so localStorage is shared between dev and Docker on the same host). 38080 was chosen over Vite's default 5173 specifically because 5173 (and other common dev-tool defaults like 3000/8080) collide with other local projects' containers, causing the browser to serve a stale cached SPA from the wrong origin's service worker.
- `.dockerignore` is a **denylist** (conventional exclude patterns, not a `*` + `!` allowlist): anything NOT matched by a pattern IS sent to the build daemon and lands in build-stage layers via `COPY . .`. It excludes `node_modules`, `dist`, `.git`, the intake docs, and secret-shaped files (`.env*`, `*.pem`, `*.key`, …) — extend those patterns when adding new local-only file types.
- The build does a **filtered** install (`pnpm install --frozen-lockfile --filter @workspace/dm-screen --filter @workspace/scripts`) that deliberately excludes the bridge's Agent-SDK deps. The manifest set is `COPY`d before the install so `--frozen-lockfile` can resolve the graph — **if you add a workspace dependency to dm-screen (or scripts), add a matching `COPY <pkg>/package.json` line** or the frozen-lockfile install fails in the image. `packages/bridge-protocol` is copied for exactly this reason (it's a dm-screen dep); its types are erased at build time so nothing enters the runtime image.
- Builds on ARM64 (Apple Silicon, Pi, Graviton) — the `linux-arm64-gnu` variants are explicitly **not** excluded.

## Security: npm minimum release age

[pnpm-workspace.yaml](pnpm-workspace.yaml) sets `minimumReleaseAge: 1440` (24 hours). This is a supply-chain attack defense and **must not be lowered or removed**. If a brand-new release is urgently needed, add it to a `minimumReleaseAgeExclude` allowlist and remove the exclusion once 24 hours have passed.

## Backup / restore

Two surfaces in `src/lib/`:

- `partyStore.ts` — `exportPartyAsJson` / `preparePartyImport` (envelope `schema: "selene-dm-party"`, version 1). Wired into the Party widget header. Import is **two-phase**: `preparePartyImport(text)` validates + returns `{ summary, commit }`; the widget shows a count-aware confirm before calling `commit()`.
- `backup.ts` — `exportFullBackupAsJson` / `prepareImport` (envelope `schema: "selene-dm-full"`, version 1). Sweeps every `dm-*` localStorage key — no registry to maintain. Wired into the sidebar BACKUP panel. Import is **two-phase**: `prepareImport(text)` snapshots existing state + validates each value through a per-key validator registry and returns `{ summary, commit }`; `commit()` wipes existing `dm-*` keys, writes the validated pairs (restoring the snapshot on any throw — atomic), then reloads the page so every widget initializes from the restored state cleanly.
