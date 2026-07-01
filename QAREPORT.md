# 🔍 QA Team Review Report

| Key                 | Value                                                                                                                |
| ------------------- | ------------------------------------------------------------------------------------------------------------------- |
| **Branch**          | `feat/static-selfhost`                                                                                               |
| **Base**            | `master-replit`                                                                                                      |
| **Files changed**   | 163 total (36 hand-written source files reviewed; bundled data blobs + lockfile excluded)                            |
| **Agents deployed** | 🔒 security · 🔄 reliability · ⚡ performance · 🔗 compatibility · 📊 data-integrity · 🎨 frontend · ✏️ copy · 🧑‍💻 generalist-a · 🕵️ generalist-b |
| **Date**            | 2026-06-30                                                                                                           |

---

## 📋 Summary

- Full three-tier (React + Express + PostgreSQL) → **static self-hostable SPA** migration: all `/api/*` fetches replaced with bundled reference data + `localStorage` stores; backend/DB removed.
- Adds **PWA** (service worker, offline precache), **Docker/nginx** static hosting, **backup/restore + party import/export**, lazy-loaded widgets, dark-mode amethyst theme, and confirmation gates on destructive actions.
- Data-integrity, security, and reliability plumbing is **unusually careful**: two-phase validated import with atomic rollback, idempotent boot-time migrations, prototype-pollution-safe parsing, per-tile error boundaries.
- One feature ships **broken end-to-end for its documented use case**: the Docker sub-path deploy.

### Key findings

- 🟠 **Sub-path Docker deploy is half-wired** — Vite bundle is `BASE_PATH`-aware but `nginx.conf` is not → `BASE_PATH=/dm/` build serves `index.html` for asset requests; app won't boot (3-agent convergence).
- 🟡 **`validateCombatants` skips id de-duplication** that the party path performs → duplicate combatant ids share a React key; one HP click / delete hits both rows.
- 🟡 **Re-opening the same monster from Initiative is a silent no-op** (stale `bestiaryTarget` can't re-fire its effect on an identical value).
- 🟢 Cross-module wall-clock-seeded combatant id counters can collide (feeds the dedup gap above) — 3-agent convergence.

---

## 🏁 Verdict

> ⚠️ **REQUEST CHANGES**

Two independent agents rated HIGH on the same issue. The branch is otherwise production-quality, but the **sub-path nginx/`BASE_PATH` mismatch** (🟠, flagged by 3 agents) ships a documented feature that is broken when used directly, and the **duplicate combatant-id gap** (🟡) is a concrete mid-combat corruption path. Fix #1 and #2 before merge; the rest are non-blocking.

---

## 👥 Agent summaries

| Agent             | Risk        | Summary                                                                                                                   |
| ----------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------- |
| 🔒 security       | 🟢 LOW      | Trust boundaries (JSON import, localStorage) well-defended; prototype pollution tested & not exploitable; strong CSP. Only dead-code `dangerouslySetInnerHTML` + Google Fonts dependency. |
| 🔄 reliability    | 🟢 LOW      | Atomic restore w/ documented rollback, idempotent migrations, surfaced (not swallowed) quota failures, double-wrapped lazy widgets, clean listener teardown. |
| ⚡ performance    | 🟢 LOW      | Lazy-load + manualChunks correctly wired; lookup indexes built once; spell hot-path precomputed. Minor: `monsterSearch` pulls two datasets; filtered bestiary list unvirtualized. |
| 🔗 compatibility  | 🟠 HIGH     | Persisted-data versioning/migrations/envelope gating solid; Docker glibc/arm64 intact. **Sub-path deploy non-atomic: nginx not base-aware.** |
| 📊 data-integrity | 🟢 LOW      | Atomic full-snapshot rollback, NaN/dup-id guards on party + initiative, confirmations on all destructive ops. Minor visibility gaps on party-import drops + UI-only keys. |
| 🎨 frontend       | 🟡 MEDIUM   | Strong error/empty/IME/confirmation handling. **Re-open-same-monster dead-click;** icon-only buttons lack `aria-label`; live combatant ids not collision-safe. |
| ✏️ copy           | 🟢 LOW      | Destructive/import copy states consequences clearly; no spelling/grammar errors. Nits: ambiguous "those widgets will reset" line; import-tooltip wording inconsistency. |
| 🧑‍💻 generalist-a   | 🟡 MEDIUM   | Migration delivers commit claims; robust failure handling. Would block on nginx-vs-`BASE_PATH` mismatch; LOW id-collision + `"empty"` slipping into recent-widgets. |
| 🕵️ generalist-b   | 🟠 HIGH     | Validation plumbing careful. **Sub-path deploy broken** + **duplicate combatant-id corruption** (validate doesn't dedupe like party path); cross-module id counter collision. |

**Note:** ✏️ copy findings are non-blocking nits. 🧑‍💻 generalist-a / 🕵️ generalist-b are independent generalists — their convergence with specialists raises confidence on findings #1 and #4.

Risk emojis: 🔴 CRITICAL · 🟠 HIGH · 🟡 MEDIUM · 🟢 LOW · ⚪ NONE

---

## 📝 Findings

| #   | Status  | Priority  | Finding                                              | Location                                                        | Agents                                  | Reasoning                                                                                                                                                                          | Suggested fix                                                                                                       |
| --- | ------- | --------- | --------------------------------------------------- | -------------------------------------------------------------- | --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| 1   | ✅ Fixed | 🟠 High   | Sub-path deploy: nginx not `BASE_PATH`-aware        | `docker/nginx.conf:176-218`, `Dockerfile`, `vite.config.ts:16` | compatibility · generalist-a · generalist-b **(convergent ×3)** | Vite emits `/dm/assets/…`, `/dm/sw.js`, `/dm/manifest.webmanifest`, but nginx hard-codes root-anchored `location /assets/` etc. `BASE_PATH=/dm/` build hit directly → assets fall through to `index.html` (MIME error under strict CSP) → blank app; PWA no-cache rules never apply. `HEALTHCHECK` still reports healthy, masking it. | **Fixed:** documented the required prefix-stripping contract in `nginx.conf` header + README with concrete nginx (`proxy_pass …:8080/;`) and Traefik StripPrefix examples; container intentionally serves at root. |
| 2   | ✅ Fixed | 🟡 Medium | `validateCombatants` doesn't dedupe combatant ids   | `src/lib/combatant.ts:63-86`                                   | generalist-b (frontend, generalist-a related) | Unlike `normalizePartyBatch`, it skips duplicate-id renumbering. A hand-edited/hostile backup (or DevTools edit) with two combatants sharing an `id` passes validation; both render with identical React `key`, and `updateHp`/`removeCombatant` `.map`/`.filter` by id hit BOTH rows → silent mid-combat corruption. | **Fixed:** added a `mintCombatantId` helper + dedupe post-pass that renumbers id collisions (mirrors `normalizePartyBatch`).         |
| 3   | ✅ Fixed | 🟡 Medium | Re-opening same monster from Initiative is a no-op  | `src/App.tsx:45-65`, `src/components/widgets/BestiaryWidget.tsx:307-312` | frontend                                | `dm-open-bestiary` sets `bestiaryTarget`; the `[target]` effect can't re-fire if the value is identical (React bails the state update), so re-dispatching the same monster name without an intervening "Back" is a silent dead click. | **Fixed:** the open effect now calls `onTargetClear?.()` to consume the one-shot signal, so a repeat dispatch always transitions `null→name` and re-fires. |
| 4   | ⬜ Open | 🟢 Low    | Cross-module combatant id counters can collide      | `src/components/widgets/InitiativeWidget.tsx`, `PartyWidget.tsx` | frontend · generalist-a · generalist-b **(convergent ×3)** | Both modules independently seed `let idCounter = Date.now()`. A Party→Initiative add and an Initiative-form add within the same ms can mint identical ids → same React key + HP/turn cross-targeting (feeds #2). | Mint combatant ids from one shared helper, or use the collision-resistant `c-${random}` form `validateCombatants` already uses. |
| 5   | ⬜ Open | 🟢 Low    | UI-only filter/selection keys lack validators       | `useLocalStorage` call sites in Bestiary/Compendium/Oracle/Tome widgets | data-integrity · generalist-b           | CLAUDE.md contract says pair each call site with the import-path validator. These keys pass none, so a wrong-typed-but-JSON-valid value survives restore/read. Used only in comparisons today (matches nothing, no crash), but a future arithmetic/`.map` extension inherits an unguarded path. | Add `validateBoundedInt`/`validateEnum` validators at these call sites.                                              |
| 6   | ⬜ Open | 🟢 Low    | `commit()` return relies on `never`-inference        | `src/lib/backup.ts:421-433`                                   | reliability · data-integrity            | `commit(): ImportResult` only `return`s in the `try`; `catch` calls `rollback` (`never`). Correct today, but if `rollback` ever stops being `never`, `commit` silently returns `undefined` and the caller reads `.skipped` off it. | Add an explicit `throw` after `rollback`, or annotate to make the invariant load-bearing.                          |
| 7   | ⬜ Open | 🟢 Low    | No `base` trailing-slash normalization               | `src/vite.config.ts:16`                                        | compatibility                           | `BASE_PATH` used verbatim as Vite `base`; `BASE_PATH=/dm` (no trailing slash) builds subtly broken assets instead of erroring.                                                    | Normalize to leading+trailing slash, or throw a clear error if it doesn't end with `/`.                            |
| 8   | ⬜ Open | 🟢 Low    | Icon-only buttons missing `aria-label`               | `Sidebar.tsx` (collapsed rail), Initiative `+`/reset, Party `Download`/`Upload` | frontend                                | Rely on `title` (tooltip) for the accessible name; screen readers on the collapsed rail hear "button" with no label.                                                             | Add `aria-label` to icon-only buttons.                                                                              |
| 9   | ⬜ Open | 🟢 Low    | Healthcheck definitions diverge                      | `docker-compose.yml:18` vs `Dockerfile:119-120`               | compatibility                           | Compose does a body-discarding `wget` on `/`; Dockerfile greps `/index.html` for `id="root"`. Compose check is weaker and could pass on a partially-broken build.               | Align compose healthcheck with the Dockerfile's content-aware grep.                                                |
| 10  | ⬜ Open | 🟢 Low    | `"empty"` accepted into `dm-recent-widgets`          | `src/lib/backup.ts:280`                                       | generalist-a                            | `WIDGET_TYPES` includes `"empty"`, so a crafted backup can seed `"empty"` into the recent list (runtime `pushRecent` filters it out, cap 8 vs validator 16). Cosmetic only.     | Validate recent-widgets against `WIDGET_TYPES` minus `"empty"`; cap at 8.                                          |
| 11  | ⬜ Open | 🟢 Low    | Dead-code `dangerouslySetInnerHTML` in unused chart  | `src/components/ui/chart.tsx:79`                              | security                                | Sole HTML-injection sink; injects generated CSS from a trusted config, and the component is unimported. Safe now, but a future wiring-up by someone unaware of the trust assumption is a latent risk. | Delete the unused `ui/chart.tsx`, or comment that its `config` must never come from imported/localStorage data.    |
| 12  | ⬜ Open | 🟢 Low    | Google Fonts is the one outbound network dependency  | `index.html:8-10`                                            | security                                | Softens the "zero runtime network" claim; render-blocking third-party request leaks visitor IP (allowlisted in CSP, SW-cached). Availability/privacy, not code-exec.            | Optional: self-host Inter via `@fontsource/inter`; drop the two font origins from CSP.                              |
| 13  | ⬜ Open | 🟢 Low    | `monsterSearch` pulls two datasets; bestiary list unvirtualized | `src/lib/monsterSearch.ts:62-118`, `BestiaryWidget.tsx:384,420` | performance                             | Mounting Initiative downloads both `data-bestiary` + `data-monster-index` (~660 KB raw); a broad bestiary query renders ~240 unvirtualized rows. Bounded; SW-precached; sub-ms at current scale. | Optional: precompute the ~40 rich-name overlap into a constant; lower the display cap for consistency.            |
| 14  | ⬜ Open | 🟢 Low    | Copy nits (non-blocking)                             | `Sidebar.tsx:42,50`; Party/Sidebar import tooltips             | copy                                    | "those widgets will reset to default" has an ambiguous antecedent; the two Sidebar import tooltips (and expanded vs collapsed) differ in casing/wording for the same button.     | Reword the skipped-items line; unify the import tooltips.                                                          |

Priority: 🔴 Critical (security/data-loss/outage) · 🟠 High (must fix before merge) · 🟡 Medium (should fix) · 🟢 Low (nit). Convergent findings (#1, #4) carry higher confidence.
