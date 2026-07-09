# Epic: AI Chat widget (Claude + ddb-mcp)

Status: **Phases 1–2 complete + a Phase-2 hardening/code-review pass** — last touched
2026-07-09. Phases 3–7 and 9 not started; Phase 8 (unit tests) partially landed for the pure
client logic. The original plan below is preserved as the record; see the **Progress log**
immediately after the Summary for what was actually built and which "Recommended" positions
changed. Inline `UPDATE`/`RESOLVED` notes flag the specific items that moved so nothing gets
built on the stale versions.

## Summary

Add an eighth widget: an AI chat panel that answers rules/party/monster questions by talking
to Claude and to the `ddb-mcp` MCP server (the user's existing D&D Beyond MCP integration,
sibling repo at `~/ddb-mcp`). Chat should be able to look up a character or monster from D&D
Beyond and let the DM push that data into the Party, Bestiary, or Initiative widgets with an
explicit click — not silently overwrite anything.

This is the first feature in the repo that requires a **persistently-running local process**
beyond the static SPA. That's a deliberate, scoped exception to the "one deployable artifact,
no backend" architecture documented in `CLAUDE.md` — it must stay optional. The core SPA,
Docker image, and every existing widget must keep working exactly as today with the bridge
process not running; the chat widget alone degrades to an "AI bridge not running" state.

## Progress log

### Phase 1 — bridge scaffold ✅ (2026-07-08, Claude Code)

Built, typechecked, and smoke-tested end-to-end; the SPA/Docker build is unaffected. New
package **`services/ai-bridge`** (`@workspace/ai-bridge`): `src/{config,auth,ddbTools,agent,server,index,smoke}.ts`
+ `README.md`. Decisions made or changed during implementation (flagged per this doc's own
instruction to "come back and say so"):

1. **Auth (decision 1) — verified; plan adjusted.** The Agent SDK's subscription/OAuth path
   is **no longer documented** (the official auth docs now list only `ANTHROPIC_API_KEY` /
   Bedrock / Claude-Platform-on-AWS / Vertex / Foundry, plus a note discouraging claude.ai
   login "for their products"). But it still **works** and still **draws on subscription
   limits** — `support.claude.com/en/articles/15036540` confirms the 2026-06-15 change to a
   separate credit pool remains **paused**. This is personal / localhost / single-user, i.e.
   the sanctioned "personal projects" case, not a shipped product. **James chose "support
   both, prefer subscription" (2026-07-07):** the bridge strips `ANTHROPIC_API_KEY` /
   `ANTHROPIC_AUTH_TOKEN` from the SDK subprocess env by default (→ subscription via the
   `claude` login or `CLAUDE_CODE_OAUTH_TOKEN`), and uses a metered key **only** when
   `AI_BRIDGE_ALLOW_API_KEY=1` is explicitly set — never silently. Verified: chat turns
   authenticate on the subscription (`service_tier: standard`, no key).

2. **Bridge shape (decision 2) — implemented as specified.** One combined process running an
   Agent SDK `query()` with ddb-mcp attached over stdio; no hand-written MCP client. MCP-attach
   API confirmed: `options.mcpServers` + a permission gate.

3. **ddb-mcp is now the published npm package, not a local clone (2026-07-08).** The bridge
   depends on **`@iamjameslennon/ddb-mcp@2.10.1`** (pinned; clears the 24h supply-chain gate)
   and resolves its `dist/index.js` from `node_modules` via `require.resolve` — no clone-and-
   build for users. `DDB_MCP_ENTRY` overrides to a local clone for ddb-mcp development. This
   **supersedes** every "read from `~/ddb-mcp`" assumption in the plan below (the generators'
   `../5etools-src` note in CLAUDE.md is unrelated and unchanged).

4. **Tool allowlist — 26 read-only tools, enforced as a hard gate.** ddb-mcp's tool set has
   grown to ~35; the allowlist was rebuilt from its actual `readOnlyHint` / `destructiveHint`
   annotations (`src/ddbTools.ts`). Excluded: `ddb_login`, `ddb_close_browser`,
   `ddb_clear_cache`, `ddb_download_character`, `ddb_interact`, `ddb_navigate`, `ddb_get_page`,
   `ddb_search_site`, `ddb_get_character_raw`. Enforcement is the Agent SDK **`canUseTool`**
   callback as the single authority — **not** `allowedTools`, because a bare `allowedTools`
   entry auto-approves a tool *before* the callback runs (splitting enforcement and emitting a
   `CAN_USE_TOOL_SHADOWED` warning). `canUseTool` allows only the 26 and hard-denies everything
   else, including all built-in filesystem/exec tools. Verified: the model reports it has "no
   filesystem access."

5. **Transport — HTTP + SSE** (Node built-in `http`, zero framework deps), bound to
   **`127.0.0.1:38900`** only. `GET /health` (reachability + billing mode + ddb-mcp status —
   for the widget's "bridge not running" check) and `POST /chat` `{ "message": "..." }`
   streaming typed SSE events `text` / `tool` / `done` / `error`.

6. **Dev orchestration — one command.** `pnpm dev` runs the SPA *and* the bridge in parallel
   (pnpm native `--parallel`, no new dep); `pnpm dev:app` = SPA only, `pnpm dev:ai` = bridge
   only. The bridge stays optional — it starts harmlessly without creds; only chat turns need
   auth. (This is the opposite of the last Open Question's guess below — James chose to bundle
   it into the default `pnpm dev`.)

7. **Docker image unchanged.** `services/ai-bridge` is a workspace member, but the Dockerfile
   install is filtered to `dm-screen` + `scripts`, so the Agent SDK + Playwright never enter
   the image build; the bridge manifest is copied only so `--frozen-lockfile` validates.

**Not yet exercised:** a *live* ddb tool call (needs a valid ddb session on disk — the DM runs
`ddb_login` once themselves; out of Phase-1 scope). Token-level streaming (block-level for
now), structured tool-result events, and unit tests are Phases 3/8.

### Phase 2 — chat widget shell ✅ (2026-07-08, Claude Code)

Eighth widget added and registered everywhere a widget kind lives; typechecked, full suite
(48 tests) green, production build clean (no `/api/` in the bundle). Verified end-to-end
against a live bridge (subscription auth) **and** with the bridge stopped.

- **New client** `artifacts/dm-screen/src/lib/aiBridge.ts` — the browser side of the bridge
  contract: `checkHealth()` (short-timeout reachability/billing probe), `streamChat()` (POST
  `/chat`, reads the `ReadableStream`, splits SSE records on `\n\n`), a pure `parseSseRecord()`
  (structured for a Phase-8 unit test), `friendlyToolName()`, and a `BridgeUnreachableError`
  the widget uses to distinguish "bridge down" from a bridge-reported error. `BRIDGE_URL` is a
  plain const (`http://127.0.0.1:38900`) — no `import.meta.env`, since `vite/client` types
  aren't wired up in this package.
- **New widget** `src/components/widgets/AIChatWidget.tsx` — three states: `checking` (probe on
  mount), `offline` (clear "AI bridge not running · start with `pnpm dev:ai`" + Retry), and the
  chat view (streamed assistant text, a lightweight per-message tool-call indicator, a
  Stop/Send composer with Enter-to-send, and an "online · <billing>" footer). **No persistence**
  — session React state only (Phase 6 decides history persistence). Aborts the in-flight turn on
  unmount and on Stop.
- **Registration** (each widget kind lives in five places): `types.ts` `WIDGET_TYPES`
  (`"ai-chat"` — this also makes it valid in `validateTiles`/backup automatically),
  `DMTile.tsx` (lazy import + `widgetMeta` + render; inherits the shared `Suspense` +
  `ErrorBoundary`), `Sidebar.tsx` `widgetMeta` (recent-widgets — the exhaustive `Record` type
  forces this), and `WidgetSelectorModal.tsx` (picker card). Accent color: amber, the one
  unused slot. Lazy chunk is ~8 kB; the dataset chunks are untouched.
- **Deferred to later phases as planned:** structured preview cards for character/monster
  lookups (Phase 3 — the bridge only emits `{type:"tool", name}` today, so the widget shows a
  chip, not a card), "Add to Party/Initiative" hand-off (Phase 4), bundled-data-first routing
  (Phase 5), history persistence (Phase 6), README (Phase 7).

### Phase 2 hardening — code review pass ✅ (2026-07-09, Claude Code)

`/code-review high` on the branch surfaced four issues; all fixed and verified (`pnpm typecheck`
+ `typecheck:deployable`, production build with `grep /api/` and `grep bridge-protocol` both zero,
**61 tests** green, and a full **Docker image build** to prove the new workspace dep survives the
filtered `--frozen-lockfile` install).

1. **Bridge crash on client disconnect (server.ts).** `handleChat` guarded writes on
   `res.writableEnded`, which is only true when *we* end — not when the client (Stop button,
   closed tile) closes the socket. The post-abort `error` event then wrote to a destroyed
   response, and with no `res.on("error")` handler that was an unhandled `'error'` → process
   crash. Fixed: guard every write on `res.writable` (false on peer close too) and swallow
   response `'error'`.
2. **Wedged conversation after a resume failure (AIChatWidget.tsx).** `sessionIdRef` was echoed
   back as `resume` forever; once a session was rejected/evicted, every later turn re-sent the
   dead id and failed identically. Fixed: clear `sessionIdRef` on any `error` event so the next
   message starts a fresh session.
3. **Dead error write (AIChatWidget.tsx).** The `BridgeUnreachableError` branch set a per-message
   error *and* flipped `status` to `offline`, which replaces the whole chat view — so the bubble
   never rendered. Removed the dead write.
4. **Type duplication → shared package + validated parser (A+B).** `BridgeEvent`/`BridgeHealth`
   were hand-copied across the Node/browser boundary. Extracted the canonical, **types-only**
   `@workspace/bridge-protocol` (`packages/bridge-protocol`), imported via `import type` by both
   the bridge and the widget (drift is now a compile error; erased from the bundle). Because
   shared types can't validate socket bytes, `parseSseRecord` now validates each variant's shape
   via a new `isBridgeEvent` guard (unknown/future event types fail safe). Wired through
   `pnpm-workspace.yaml` (`packages/*`), both manifests, the lockfile, and a new Dockerfile
   `COPY packages/bridge-protocol/package.json` before the filtered install.

**Also landed this branch (beyond the original Phase-2 shell):** multi-turn continuity — the
bridge accepts `{ resume: "<sessionId>" }` on `/chat` and replays that Agent session; the widget
captures each turn's `done.sessionId` and echoes it back, with `/clear` and `/new` slash commands
(and the "New chat" button) resetting it.

**Phase-8 unit tests: partially done.** `artifacts/dm-screen/src/lib/aiBridge.test.ts` now covers
the pure client logic (`isBridgeEvent`, `parseSseRecord`, `friendlyToolName`). Component/DOM tests
for the widget itself remain deferred (would need jsdom + `@testing-library/react`, per CLAUDE.md).

---

## Decisions already made (in a planning conversation with James, 2026-07-07)

These four questions were discussed and decided; don't re-litigate them without a reason —
if you hit a wall, come back and say so rather than silently picking a different path.

1. **Claude auth**: the bridge uses the Claude **Agent SDK** (TypeScript), authenticated with
   an OAuth token from `claude setup-token` (or a reused `/login` session) — **not** an
   `ANTHROPIC_API_KEY`. This draws from James's Claude Pro/Max subscription usage limits, not
   metered API billing. Verify this is still current behavior when you start (Anthropic
   paused a change on 2026-06-15 that would have moved Agent SDK usage to a separate credit
   pool — check `code.claude.com/docs/en/authentication` and
   `support.claude.com/en/articles/15036540` for the live state before building, since this
   is exactly the kind of policy detail that can move). Do **not** set `ANTHROPIC_API_KEY` in
   the bridge's environment — if a subscription session isn't available, the bridge should
   fail loudly with a setup instruction, not silently fall back to metered billing.

   > **UPDATE (2026-07-08, Phase 1):** Verified and adjusted — the subscription/OAuth path is
   > now *undocumented* but still works and still bills to the subscription (the June-15
   > credit-pool change is still paused). James chose **"support both, prefer subscription":**
   > subscription by default, metered `ANTHROPIC_API_KEY` only when `AI_BRIDGE_ALLOW_API_KEY=1`
   > is explicitly set. See the Progress log.

2. **Bridge shape**: **one combined local bridge process**, not two, and not a change to
   ddb-mcp's transport. The bridge runs an Agent SDK session with ddb-mcp attached as an MCP
   server over stdio — the same mechanism Claude Code already uses to attach it interactively
   (check `~/ddb-mcp`'s own docs / the user's existing `.mcp.json` for the exact invocation).
   The Agent SDK's own agent loop handles tool-calling; you should not need to hand-write a
   ddb-mcp client. Known trade-off accepted up front: this pulls ddb-mcp's Playwright
   dependency into this widget's local footprint. That's fine — it's opt-in.

3. **Data hand-off UX**: **preview inline, click to commit**. When a tool call resolves a
   character or monster, the chat message shows a structured preview card inline (not just
   prose) with an explicit "Add to Party" / "Add to Bestiary" / "Add to Initiative" button.
   Nothing is written to another widget's `localStorage` state until the DM clicks. Reuse the
   existing cross-widget `CustomEvent` pattern (see `dm-add-to-initiative`, `dm-open-bestiary`
   in `App.tsx` / widgets) rather than introducing React context — this is a hard rule from
   `CLAUDE.md`, not just a suggestion.

4. **Rules Q&A source of truth**: **bundled datasets first, ddb-mcp fallback**. Prefer the
   already-bundled `spells.ts` / `bestiary.ts` / `compendium.ts` (557 spells, 40 rich
   monsters, hand-curated rules) since that's what the DM is already looking at in the other
   widgets, and only escalate to ddb-mcp (live D&D Beyond + Open5e fallback) when the local
   search comes up empty. Do this lookup **client-side, in the browser**, the same way
   `WizardsTomeWidget` / `BestiaryWidget` / `CompendiumWidget` already search their bundled
   data — there's no need to teach the bridge about the bundled datasets at all. Only send a
   chat turn to the bridge when the local search misses, or for anything that's inherently
   live (a specific player's current HP, a homebrew monster, etc.).

## Non-goals for v1

- No multi-user or remote-hosted bridge. Single DM, single machine, localhost only.
- No write-back to D&D Beyond. The bridge must **not** expose `ddb_interact`, `ddb_navigate`,
  `ddb_login`, or `ddb_download_character` as tools available to the model — those are
  browser-driving / destructive tools in ddb-mcp's own toolset (see its `destructiveHint`
  annotations) and have no business being reachable from a chat model. Restrict the model to
  read-only tools: `ddb_get_character`, `ddb_list_characters`, `ddb_character_lookup`,
  `ddb_get_monster`, `ddb_search_monsters`, `ddb_search_spells`, `ddb_search_rules`,
  `ddb_get_rules`, `ddb_get_condition`, `ddb_get_equipment`, `ddb_rate_encounter`,
  `ddb_roll_treasure`, `ddb_get_campaign`, `ddb_list_campaigns` (confirm the exact current
  list against `~/ddb-mcp/src/index.ts` — it may have grown since this doc was written).
  **Excluding `ddb_login` from the model's tools does not limit what content it can reach** —
  see Prerequisites below.

## Prerequisites (must exist before the bridge is useful)

- **A valid ddb-mcp session must already be on disk.** All the browserless read tools
  (`ddb_get_character`, `ddb_read_book`, `ddb_search_rules`, ...) work by reading saved
  cookies from `~/.config/ddb-mcp/session.json` (or the Windows equivalent) and exchanging
  them for a short-lived cobalt JWT via `sessionFetch()` — they do **not** need `ddb_login` to
  run again. So gated content (rulebooks the DM owns, specific characters/campaigns) is fully
  reachable by the chat's read-only tools as long as the DM has run `ddb_login` **once,
  themselves, outside the chat widget** (e.g. via Claude Code interactively, same as today).
  This is a one-time setup step, not something the bridge or the model should ever trigger.
- **Session expiry is a setup-error state, not a chat-time retry.** If `sessionFetch()` starts
  failing because the saved session expired, the bridge should surface a clear "your D&D
  Beyond session has expired — run `ddb_login` yourself to refresh it" message rather than
  attempting any kind of re-authentication from within the chat flow. Document this in the
  README alongside the rest of the bridge setup steps.
- No auto-sync / silent overwrite of Party or Initiative state (see decision 3).
- No attempt to make the chat widget work offline. It's explicitly a networked feature in an
  otherwise-offline-capable PWA; just make sure its failure mode is contained to its own tile
  (existing `Suspense` + `ErrorBoundary` wrapping already does most of this work).

## Architecture

```
Browser (SPA)                      Local bridge process              ddb-mcp (existing)
┌─────────────────────┐            ┌───────────────────────┐         ┌──────────────────┐
│ AIChatWidget.tsx     │  HTTP/WS   │ Agent SDK session      │  MCP    │ stdio server,     │
│ - message list       │◄──────────►│ - OAuth token auth     │◄stdio──►│ Playwright-backed │
│ - preview cards      │  localhost │ - ddb-mcp attached as  │         │ D&D Beyond access │
│ - "Add to ___" btns  │            │   MCP server           │         └──────────────────┘
│ - local bundled-data │            │ - restricted tool list │
│   search (spells/    │            └───────────────────────┘
│   bestiary/compendium)│                     │
└──────────┬───────────┘                      │ Anthropic API (OAuth,
           │ CustomEvent on window             │ subscription usage)
           ▼                                   ▼
  Party / Bestiary / Initiative          api.anthropic.com
  widgets (existing, unchanged
  storage shape + validators)
```

The bridge is a new local Node service the DM starts alongside `pnpm dev` (or the Docker
container) only if they want the chat widget. It is **not** part of the static build output
in `artifacts/dm-screen/dist/public/` and does not change the Docker image's default
behavior.

### New workspace package

Add a new top-level package for the bridge — suggest `services/ai-bridge` (a new category
alongside `artifacts/` and `scripts/`, since this is a long-running service rather than a
deployable SPA or an offline generator). Requires adding `services/*` to the `packages:` list
in `pnpm-workspace.yaml`. Confirm naming/location with your own judgement once you see how
much code it ends up being — a single well-organized file under `scripts/` might be enough if
the bridge stays small; don't over-scaffold.

> **RESOLVED (Phase 1):** Created at **`services/ai-bridge`** (`@workspace/ai-bridge`);
> `services/*` added to the workspace. Split into small focused modules
> (`config`/`auth`/`ddbTools`/`agent`/`server`/`index`), not a single file. The Dockerfile
> install is filtered to exclude it so it stays out of the deployable image (Progress log #7).

### New widget

`artifacts/dm-screen/src/components/widgets/AIChatWidget.tsx`, lazy-loaded via `DMTile.tsx`
exactly like the existing seven, wrapped in the same `Suspense` + `ErrorBoundary` pair.

### Bridge transport contract

Whatever you pick (HTTP+SSE, WebSocket, whatever the Agent SDK's streaming primitives make
easiest), the browser side needs at minimum:
- send a chat turn (plain text)
- receive streamed assistant text
- receive a distinct, typed "tool result" event for character/monster lookups (not just
  buried in prose) so the widget can render a preview card instead of parsing markdown
- a way to detect "bridge unreachable" quickly (short timeout / connection-refused check) so
  the widget can show a clear "start the AI bridge" message rather than spinning

### Security

- Bridge binds to `127.0.0.1` only — never `0.0.0.0`. This project runs on home networks via
  Docker; an unauthenticated localhost service that can spend the DM's Claude subscription
  and read D&D Beyond data must not be reachable from the LAN.
- ddb-mcp already wraps DDB user-authored text (character notes, homebrew descriptions) in
  `<untrusted_dndbeyond_content>` delimiters via its `wrapUntrusted()` helper (see its
  `src/utils.ts`) specifically to blunt prompt injection from that content. Preserve this: the
  bridge must consume ddb-mcp **only** through the standard MCP tool-call interface (attaching
  it as an MCP server, as decided above), not by reaching into ddb-mcp's internals — that's
  what keeps this protection intact.
- Don't log full chat transcripts anywhere they'd persist beyond what the DM already accepts
  for other widget data (see chat history question below).

## Data hand-off details to work out

- **Party**: if the looked-up player ID matches an existing roster entry (by name or a stored
  D&D Beyond character ID — decide which key to match on), "Add to Party" should show a
  diff/confirm step before overwriting, consistent with the existing "confirmation prompts
  for reset actions" pattern already in the widgets (see `PartyWidget.tsx` /
  `InitiativeWidget.tsx` history). Never silently clobber an existing party member.
- **Bestiary**: the bundled bestiary dataset (`bestiary.ts`) is generated at build time from a
  pinned 5etools clone — it's not meant to be mutated at runtime, and there's no existing
  mechanism for a runtime-added monster to live there. Recommended: "Add to Initiative" from a
  monster preview card should go **straight to the Initiative widget's combatant list**
  (reusing its existing combatant shape) without touching the Bestiary widget's dataset at
  all. Treat the ddb-mcp monster lookup as ephemeral, chat-scoped data — don't try to persist
  arbitrary live-fetched monsters into the Bestiary widget for v1. Flag if this feels wrong
  once you're implementing — an overlay of "session monsters" on top of the bundled bestiary
  is a reasonable v2, but adds real complexity (another `dm-*` key, another validator, another
  backup/restore path) for a use case that might not come up often.
- **Chat history persistence**: decide explicitly rather than defaulting to "persist
  everything." Chat responses may echo D&D Beyond character/campaign content. If you persist
  it (a `dm-ai-chat-v1` key, following the versioned-key convention), cap it the way
  `MAX_COMBATANTS`/`MAX_PARTY` cap those lists (see `combatant.ts`/`partyStore.ts`), and make
  sure it's covered by the full-backup sweep and by a validator, same as every other `dm-*`
  key. If in doubt, default to session-only (React state, not localStorage) for v1 and note
  persistence as a fast-follow — that's the lower-risk choice given the full-backup export
  already round-trips every `dm-*` key verbatim to a JSON file the DM might share.

## Suggested phases

Mirror the numbered-phase convention used for the static-SPA migration (see git log:
`phase 0` through `phase 9`). Each phase should end in a working, typechecked, tested state —
don't leave the tree broken between phases.

1. **Bridge scaffold** — ✅ **DONE (2026-07-08, see Progress log).** New package, Agent SDK
   wiring, subscription auth (with opt-in metered fallback), ddb-mcp attached as an MCP server
   with the restricted read-only tool list, minimal HTTP+SSE chat endpoint. No UI. Smoke-tested
   end-to-end; subscription billing confirmed (`service_tier: standard`, no API key).
2. **Chat widget shell** — ✅ **DONE (2026-07-08, see Progress log).** Eighth widget,
   lazy-loaded + `ErrorBoundary`, talks to the bridge, renders streamed text, clear "bridge not
   running" empty state. No persistence. Verified with the bridge running and stopped.
3. **Structured tool-result rendering** — bridge emits typed events for character/monster
   lookups; widget renders preview cards instead of raw prose.
4. **Data hand-off** — "Add to Party" / "Add to Initiative" buttons, wired via `CustomEvent`s,
   with the confirm/diff step for existing party members.
5. **Bundled-data-first rules routing** — client-side search of `spells.ts` / `bestiary.ts` /
   `compendium.ts` before a chat turn is sent to the bridge for general rules questions.
6. **Chat history decision + implementation** — per the open question above.
7. **Docs** — README section documenting the bridge as optional: how to install/authenticate
   (`claude setup-token`), how to start it, what happens if it's not running, and an explicit
   restatement that the core app needs none of this.
8. **Tests** — Vitest coverage for the new pure logic (preview-card data shaping, bundled-vs-
   ddb-mcp routing logic, party merge/diff logic), matching the existing Tier-1 testing
   conventions (`*.test.ts` beside the code, fake `localStorage`, no jsdom).
9. **Verification** — `pnpm test` + `pnpm typecheck` + production build + bundle scan, plus a
   manual pass with the bridge both running and stopped.

## Open questions for Claude Code to resolve during implementation

- ✅ **RESOLVED (Phase 1):** Agent SDK MCP-attach API — `options.mcpServers` (stdio:
  `{ command, args }`) works programmatically; no `.mcp.json` needed.
- ✅ **RESOLVED (Phase 1):** ddb-mcp tool list confirmed (~35 tools); 26-tool read-only
  allowlist built from its annotations. See Progress log #4.
- ✅ **RESOLVED (Phase 1):** transport = **HTTP + SSE** (Node built-in `http`, no deps).
- ✅ **RESOLVED (Phase 1), differently than guessed:** the bridge has a `dev` script and it
  **is** wired into the default root `pnpm dev` (parallel), with `pnpm dev:app` as the SPA-only
  fallback. No `build` script (correctly not part of the deployable). See Progress log #6.
