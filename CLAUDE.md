# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

pnpm-workspace monorepo for **Selene's DM Screen**, a browser-based D&D 5.5e (2024) Dungeon Master dashboard. Two deployable artifacts plus a sandbox, backed by a shared Drizzle/Postgres library and an OpenAPI-driven client.

> ⚠️ `replit.md` describes an older "no backend, 4 widgets, localStorage only" version and is **out of date**. The current architecture has a Postgres-backed Express API server (see `README.md` and `artifacts/api-server`). When the two disagree, trust `README.md` and the code.

## Required environment variables

Most packages fail fast at boot if these are missing:

- `DATABASE_URL` — PostgreSQL connection string. Required by `@workspace/db`, `@workspace/api-server`, and `drizzle-kit push`.
- `PORT` — both `dm-screen` (Vite) and `mockup-sandbox` (Vite) and `api-server` throw if `PORT` is unset. The frontend convention is API on `8080`, Vite proxies `/api` → `http://localhost:8080` (see `artifacts/dm-screen/vite.config.ts`).
- `BASE_PATH` — required by both Vite configs (used as the `base` for the bundle).

## Commands

Always use `pnpm` — the root `preinstall` script rejects npm/yarn.

```bash
# Install
pnpm install

# Typecheck (root): builds libs then typechecks each artifact/script
pnpm run typecheck

# Build everything (typechecks first, then runs `build` in each package)
pnpm run build

# Dev: run API and frontend in separate terminals
PORT=8080 DATABASE_URL=... pnpm --filter @workspace/api-server run dev
PORT=5173 BASE_PATH=/ pnpm --filter @workspace/dm-screen run dev

# Typecheck a single package
pnpm --filter @workspace/dm-screen run typecheck
pnpm --filter @workspace/api-server run typecheck

# Push Drizzle schema to the DB
pnpm --filter @workspace/db run push
pnpm --filter @workspace/db run push-force   # destructive — be careful

# Regenerate API client + Zod schemas from lib/api-spec/openapi.yaml
pnpm --filter @workspace/api-spec run codegen

# Seed data (run from artifacts/api-server)
tsx src/seed.ts                              # monsters from bestiary.ts
tsx src/seed-csv.ts                          # monsters from attached CSV
node scripts/import-spells.mjs               # 557 spells
node scripts/import-weapons.mjs              # 250 weapons
```

There is no test runner configured in this repo.

## Repository layout

```
artifacts/
  api-server/     Express 5 + node-postgres (raw pg.Pool, not Drizzle)
  dm-screen/      React 19 + Vite + Tailwind v4 — the DM dashboard
  mockup-sandbox/ Vite playground that auto-discovers UI mockups
lib/
  db/             Drizzle schema + pg Pool (currently empty schema)
  api-spec/       OpenAPI 3.1 spec + Orval config
  api-client-react/  Generated React Query hooks (from Orval, do not edit by hand)
  api-zod/        Generated Zod schemas (from Orval, do not edit by hand)
scripts/          Standalone tsx scripts, treated as one workspace package
```

## TypeScript / project references

Every package extends `tsconfig.base.json` (`composite: true`, `moduleResolution: "bundler"`, `customConditions: ["workspace"]`). The root `tsconfig.json` lists `lib/*` as project references.

- **Typecheck from the root** so cross-package types resolve correctly. Individual `pnpm --filter ... run typecheck` works because each package's `tsconfig.json` declares its `references`.
- When package A starts importing from package B, add `{ "path": "../../lib/<b>" }` to A's `tsconfig.json` `references` array.
- `tsc` is only used for type-checking and `.d.ts` emission. Bundling is handled by Vite (frontend) and esbuild via [artifacts/api-server/build.ts](artifacts/api-server/build.ts) (backend).

## API codegen workflow

The frontend does NOT hand-write API clients. The flow is:

1. Edit [lib/api-spec/openapi.yaml](lib/api-spec/openapi.yaml).
2. Run `pnpm --filter @workspace/api-spec run codegen`.
3. Orval writes into `lib/api-client-react/src/generated/` (React Query hooks) and `lib/api-zod/src/generated/` (Zod schemas + TS types).
4. The backend also imports schemas from `@workspace/api-zod` (e.g. [artifacts/api-server/src/routes/health.ts](artifacts/api-server/src/routes/health.ts)) so request/response shapes are shared.

The OpenAPI `info.title` is forced to `"Api"` by a transformer — generated files assume this name. Don't rename it.

## Backend split: raw pg vs Drizzle

This is the most surprising thing in the codebase. The api-server currently uses raw `pg.Pool` queries from [artifacts/api-server/src/lib/db.ts](artifacts/api-server/src/lib/db.ts), targeting tables (`monsters`, `player_characters`, `weapons`, `spells`, etc.) that were created out-of-band — they are not yet declared in the Drizzle schema. [lib/db/src/schema/index.ts](lib/db/src/schema/index.ts) is intentionally empty (template only). Two consequences:

- `drizzle-kit push` currently has nothing to push.
- Route handlers are raw SQL — when adding a column, you must update both the DB and the route's SELECT/INSERT lists.

When migrating to Drizzle, add the table to `lib/db/src/schema/`, export it from the schema index, and switch routes to `db.select(...)` against `@workspace/db`.

## Frontend architecture (dm-screen)

- Path alias: `@/* → src/*` and `@assets/* → ../../attached_assets/*`.
- shadcn/ui (style: `new-york`) lives in `src/components/ui/`; do not hand-edit those — re-add via the shadcn CLI.
- State lives in `localStorage` via the generic `useLocalStorage` hook. Keys are versioned (e.g. `dm-tiles-v3`) — bump the suffix when shape changes to avoid corrupt-state crashes on load.
- **Cross-widget communication uses DOM CustomEvents on `window`**, not React context. Example: clicking a monster in the Initiative tracker dispatches `dm-open-bestiary` with `{ detail: { name } }`, and [App.tsx](artifacts/dm-screen/src/App.tsx) listens to auto-open the Bestiary widget. Search `window.dispatchEvent`/`addEventListener` to find the wiring.
- The 3x3 (configurable 2–4 × 2–4) grid supports `colSpan`/`rowSpan` of 1 or 2; tiles spanned over are stored as `null` in the tiles array. Read [App.tsx](artifacts/dm-screen/src/App.tsx) before changing tile-resize logic — the `null` placeholders are easy to break.
- Theme is dark by default, with a light "Midnight & Amethyst" alternate driven by the `light-mode` class on the root element. CSS variables (`--dm-bg-page`, `--dm-t3`, ...) live in `src/index.css`.

## mockup-sandbox

A Vite app that auto-generates `src/.generated/mockup-components.ts` by scanning `src/components/mockups/**/*.tsx`. Files or folders prefixed with `_` are excluded. The Vite plugin in [mockupPreviewPlugin.ts](artifacts/mockup-sandbox/mockupPreviewPlugin.ts) regenerates on file add/remove and on dev-server 404s for the generated module. Don't commit changes to `src/.generated/`.

## Security: npm minimum release age

[pnpm-workspace.yaml](pnpm-workspace.yaml) sets `minimumReleaseAge: 1440` (24 hours). This is a supply-chain attack defense and **must not be lowered or removed**. If a brand-new release is urgently needed, add it to a `minimumReleaseAgeExclude` allowlist and remove the exclusion once 24 hours have passed.

## Replit specifics

- `nodejs-24` + `postgresql-16` via Nix; agent runs in `expertMode`.
- [scripts/post-merge.sh](scripts/post-merge.sh) runs `pnpm install --frozen-lockfile && pnpm --filter db push` after each merge — schema changes propagate to the Replit DB automatically.
- The deployment target is `autoscale` and the post-build prunes the pnpm store.
- Many platform-specific optional native deps (rollup, esbuild, lightningcss, tailwindcss-oxide, ngrok-bin) are explicitly nulled out via `overrides:` because Replit is linux-x64 only. If you add a dep with platform binaries, you may need to extend that list.
