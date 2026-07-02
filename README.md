# Selene's DM Screen

A full-screen, browser-based Dungeon Master dashboard for D&D 5.5e (2024), in
a Midnight & Amethyst theme. Initiative tracking, spell lookup, monster stats,
party management, random generators — every tool a DM needs in one configurable
interface.

It runs entirely in your browser — clone, `pnpm install && pnpm dev`, and you
have a DM screen. All state is saved locally; the app also installs as an
offline PWA so it keeps working at the table even if the wifi drops.

## Features

### Configurable widget grid

Arrange the screen as a 2–4 column × 2–4 row grid. Each cell can hold any
widget. Open, close, resize (1×1 or 2×2), and rearrange widgets freely; recent
widgets are saved in the sidebar for quick restore. Layout persists across
sessions via `localStorage`.

### Seven widgets

- **Compendium** — search and browse D&D 5.5e rules entries.
- **Initiative Tracker** — add players and monsters, roll initiative, track HP
  and AC round by round. Clicking a monster name jumps straight to its
  Bestiary entry. Combatants, turn order, current round, and per-combatant HP
  all persist so you can stop mid-encounter and resume later.
- **Notepad** — free-text session notes, persisted in `localStorage`.
- **Oracle** — random generator with four tabs: Names (by ancestry/race),
  Places (7 settlement types with combinatorial name patterns and
  descriptors), Loot (by CR tier), and Items (mundane & common magic).
- **Bestiary** — full-text monster search over 40 rich stat blocks plus a
  2,158-entry thin index for quick reference. Shows stat blocks, traits,
  actions, and CR-coloured badges.
- **Wizard's Tome** — searchable spell compendium (557 spells). Filter by
  level, class, or school.
- **Party** — full CRUD for player characters. Tracks name, race, class,
  level, AC, HP, weapons (with live autocomplete against 251 weapons), and
  spells. One-click dispatch to the Initiative Tracker.

### Quality of life

- Light / Dark mode toggle — a full light theme using lavender and ink tones.
- Collapsible sidebar with grid-size controls and recent-widget restore.
- Cross-widget events — Party → Initiative (add character), Initiative →
  Bestiary (view monster) via DOM custom events.
- **Backup & restore** — sidebar Export/Import buttons download a single JSON
  snapshot of everything (party, notes, layout, in-progress combat) and
  restore it into a fresh browser. Party-only Export/Import lives in the
  Party widget header.
- **Offline PWA** — load the app once online, then it keeps working with no
  network. Add it to your home screen / dock for a standalone-window install.

## Persistence model — read this

> **All your data lives in this browser only.** There is no server and no
> sync. Party roster, notes, grid layout, and the in-progress initiative
> tracker are stored under `localStorage` keys prefixed `dm-`.
>
> - **Clearing site data, using a different browser profile, or switching to
>   incognito loses everything** that wasn't exported first.
> - **Use the Backup buttons** in the sidebar before clearing data or
>   migrating to a new machine. The full backup round-trips every `dm-*` key
>   verbatim and reloads the tab on import.
> - **Stay on one origin.** Running in dev (`http://localhost:38080`) and in
>   Docker (`http://localhost:38080`) on the same port and host shares state.
>   Switching ports starts a fresh, separate store.
> - **Use one tab at a time.** State is plain `localStorage` with no
>   cross-tab conflict resolution — last write wins. If you open the screen
>   in two tabs and edit in both, whichever tab saves last silently clobbers
>   the other's change (and a backup *import* in one tab wipes `dm-*` for the
>   origin, affecting the other tab on its next write). Keep a single tab open
>   during a session.

## Getting started

### Prerequisites

- Node.js 24+
- pnpm 9+ — install with `npm install -g pnpm` or `corepack enable` (the
  root `preinstall` script rejects npm/yarn; pnpm is required for the
  workspace's `catalog:` deps and the `minimumReleaseAge` supply-chain check)

### Run locally

```bash
pnpm install
pnpm dev        # http://localhost:38080 (dev server with HMR)
```

### Production build

```bash
pnpm typecheck  # project-references-aware tsc across the workspace
pnpm build      # typechecks, then builds the SPA to artifacts/dm-screen/dist/public/
pnpm preview    # serves the built bundle on http://localhost:38080
```

### Run in Docker

```bash
docker compose up --build
# → http://localhost:38080
```

The compose file builds a multi-stage image (Node 24 build →
`nginxinc/nginx-unprivileged:alpine` runtime, so nginx runs as a non-root
user) and publishes container port 8080 on host port 38080 — deliberately
outside the common dev-tool default range (3000, 5173, 8080, ...) to avoid
collisions when another local project's container is also bound to one of
those. Change the host side of the port mapping in `docker-compose.yml` if
38080 is taken.

> Building on ARM64 hosts (Apple Silicon, Raspberry Pi, AWS Graviton) works
> out of the box. The image is glibc-based on the build stage to match the
> platform-binary `gnu` variants of rollup/esbuild/lightningcss.

**Deploying under a sub-path.** To serve the app from a sub-path behind a
reverse proxy (e.g. `https://example.com/dm/`), build with the `BASE_PATH`
build arg — it's baked into the bundle's asset URLs and the PWA
service-worker scope/registration, so it must be set at build time (the
manifest's `start_url`/`scope` are relative and follow the base
automatically). Keep the trailing slash:

```bash
BASE_PATH=/dm/ docker compose build   # compose forwards it via build.args
# or, plain docker:
docker build --build-arg BASE_PATH=/dm/ -t selene-dm-screen .
```

The container always serves at its own root (`/`), so the reverse proxy **must
strip the `/dm/` prefix** before forwarding. A plain pass-through that forwards
`/dm/` unchanged will serve `index.html` for every `/dm/assets/*.js` request and
the app will fail to boot (MIME error under the strict CSP), and the PWA
no-cache headers on `sw.js` / `manifest.webmanifest` won't apply. Strip the
prefix like so:

```nginx
# nginx — the trailing slash on proxy_pass strips the matched /dm/ prefix
location /dm/ {
    proxy_pass http://selene-dm-screen:8080/;
}
```

```yaml
# Traefik — StripPrefix middleware
labels:
  - "traefik.http.middlewares.dm-strip.stripprefix.prefixes=/dm"
  - "traefik.http.routers.dm.middlewares=dm-strip"
```

Leaving `BASE_PATH` unset serves at `/` with no proxy prefix to strip.

## Architecture

pnpm workspace with one deployable plus an offline tooling package:

```
artifacts/dm-screen/         React 19 + Vite + Tailwind v4 — the SPA (only deployable)
  src/data/                  Bundled reference data: spells, bestiary,
                             monsterIndex, weapons, generators, compendium
  src/lib/                   localStorage stores, backup/restore, shared UI primitives
  src/components/widgets/    The seven widgets
  public/                    PWA icons + static assets
  docker/nginx.conf          SPA-aware nginx config (used by the Docker image)
scripts/                     Standalone tsx data-generators (run offline)
attached_assets/             Source CSV for the thin monster index
Dockerfile, docker-compose.yml, .dockerignore
```

### Bundled reference data

| Dataset | Count | Source |
|---|---|---|
| Spells | 557 | 5etools v2.31.0 (`data/spells/*.json` + `sources.json`) |
| Bestiary (rich stat blocks) | 40 | 5etools v2.31.0 (2024 XMM preferred, falls back to 2014 MM) |
| Monster index (thin search) | 2,158 | `attached_assets/Monsters_&_Beasts_*.csv` |
| Weapons | 251 | 5etools v2.31.0 (`data/items.json` + `items-base.json`) |

The data is generated **offline** from a local sibling clone of
`5etools-src` pinned at tag `v2.31.0`. To regenerate:

```bash
# requires ../5etools-src/ checked out at tag v2.31.0
pnpm --filter @workspace/scripts run generate:all
```

5etools content is MIT-licensed; attribution is preserved at the top of each
generated data file.

## Security

`pnpm-workspace.yaml` sets `minimumReleaseAge: 1440` (24 hours) as a
supply-chain defense — newly published npm versions are not installed until
they have been public for 24h. **Do not lower or remove this.** If a brand-new
release is urgently needed, add it to a `minimumReleaseAgeExclude` allowlist
and remove the exclusion once 24 hours have passed.

## License

MIT for the application code. Bundled D&D reference data is sourced from
5etools (MIT) — see file headers under `artifacts/dm-screen/src/data/`.
