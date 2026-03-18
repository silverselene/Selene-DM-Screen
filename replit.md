# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Structure

```text
artifacts-monorepo/
├── artifacts/              # Deployable applications
│   ├── api-server/         # Express API server
│   └── dm-screen/          # Legendary DM Screen (React + Vite)
├── lib/                    # Shared libraries
│   ├── api-spec/           # OpenAPI spec + Orval codegen config
│   ├── api-client-react/   # Generated React Query hooks
│   ├── api-zod/            # Generated Zod schemas from OpenAPI
│   └── db/                 # Drizzle ORM schema + DB connection
├── scripts/                # Utility scripts (single workspace package)
│   └── src/                # Individual .ts scripts
├── pnpm-workspace.yaml     # pnpm workspace (artifacts/*, lib/*, lib/integrations/*, scripts)
├── tsconfig.base.json      # Shared TS options (composite, bundler resolution, es2022)
├── tsconfig.json           # Root TS project references
└── package.json            # Root package with hoisted devDeps
```

## Legendary DM Screen (`artifacts/dm-screen`)

Full-screen D&D 5.5e (2024 Revision) DM dashboard. No backend — all data stored in localStorage.

### Features
- **Visual theme**: Midnight & Amethyst (deep charcoal/black + purple `#8A2BE2` + gold accents)
- **Header**: Ornate dragon SVG stretching across the top with Cinzel title font
- **3×3 grid**: Each tile is an independently configurable widget slot
- **Widget selector modal**: Click "+" on any empty tile to pick a widget
- **localStorage persistence**: Layout and all widget data survive page refreshes

### Widgets
1. **5.5e Compendium Search** — searchable local JSON with 25+ 2024-specific rules entries (Weapon Masteries, Exhaustion, spells, combat rules)
2. **Initiative Tracker** — add combatants with name/initiative/HP, sort by initiative, Next Turn button, per-combatant HP tracking, round counter
3. **Session Notepad** — lined auto-saving textarea for session notes
4. **The Oracle** — three tabs: Names (by race), Loot (by CR range), Items (mundane + common magic)

### Files
- `src/App.tsx` — main layout and tile grid
- `src/components/DragonHeader.tsx` — SVG dragon header
- `src/components/DMTile.tsx` — tile wrapper with add/clear controls
- `src/components/WidgetSelectorModal.tsx` — widget picker modal
- `src/components/widgets/CompendiumWidget.tsx`
- `src/components/widgets/InitiativeWidget.tsx`
- `src/components/widgets/NotepadWidget.tsx`
- `src/components/widgets/OracleWidget.tsx`
- `src/data/compendium.ts` — 25+ 5.5e rules entries
- `src/data/generators.ts` — name/loot/item tables for The Oracle
- `src/hooks/useLocalStorage.ts` — generic localStorage hook
- `src/types.ts` — shared TypeScript types

## TypeScript & Composite Projects

Every package extends `tsconfig.base.json` which sets `composite: true`. The root `tsconfig.json` lists all packages as project references. This means:

- **Always typecheck from the root** — run `pnpm run typecheck` (which runs `tsc --build --emitDeclarationOnly`). This builds the full dependency graph so that cross-package imports resolve correctly.
- **`emitDeclarationOnly`** — we only emit `.d.ts` files during typecheck; actual JS bundling is handled by esbuild/tsx/vite...etc, not `tsc`.
- **Project references** — when package A depends on package B, A's `tsconfig.json` must list B in its `references` array.

## Root Scripts

- `pnpm run build` — runs `typecheck` first, then recursively runs `build` in all packages that define it
- `pnpm run typecheck` — runs `tsc --build --emitDeclarationOnly` using project references
