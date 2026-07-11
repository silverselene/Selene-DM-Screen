# Epic: AI Chat widget (Claude + ddb-mcp)

Status: **Phases 1–6 complete + a Phase-2 hardening/code-review pass + a model/effort-picker
increment + a Phase-5 code-review/hardening pass** — last touched 2026-07-11. Phases 7 and 9 not started; Phase 8 (unit tests)
continues to land alongside each phase's pure logic. The original plan below is preserved as the
record; see the **Progress log** immediately after the Summary for what was actually built and
which "Recommended" positions changed. Inline `UPDATE`/`RESOLVED` notes flag the specific items
that moved so nothing gets built on the stale versions.

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

### Phase 3 — structured tool-result rendering ✅ (2026-07-09, Claude Code)

Design spec: `docs/superpowers/specs/2026-07-09-phase3-structured-tool-result-cards-design.md`;
plan: `docs/superpowers/plans/2026-07-09-phase3-structured-tool-result-cards.md`. Typecheck +
84 tests (72 dm-screen + 12 bridge) green; production build clean (`grep /api/` and
`grep bridge-protocol` both zero). The chat now renders a **preview card** for each resolved
tool call instead of leaving the result in prose.

- **Key finding that shaped the design:** ddb-mcp lookups return **markdown/plain-text stat
  blocks**, not JSON (`getMonster` → markdown with a predictable `# / **Armor Class** / **Challenge**`
  header; `ddb_get_character` → a box-drawing plain-text block with `Race | Class N | Level N`,
  `HP: cur/max`, `AC: N   Initiative:`). Chosen approach: the **bridge parses** those into
  best-effort typed `fields` and **always** ships the full raw text as `markdown`, so a ddb
  format drift degrades gracefully (fields drop, block still renders) — never blanks the card.
- **New wire event** `{ type: "tool_result", tool, kind: "monster"|"character"|"generic", title,
  fields?, markdown }` in `@workspace/bridge-protocol`; `isBridgeEvent` validates it (unknown
  `kind` still parses → treated as generic).
- **New bridge module** `services/ai-bridge/src/toolResults.ts` (pure): `parseToolResult`
  (monster/character rich parsers + generic fallback) and `extractToolResultText`. `agent.ts`
  now correlates each `tool_use` id → its later `user` `tool_result` block and emits the event.
  Only `ddb_get_monster` / `ddb_get_character` get rich cards; **`ddb_character_lookup` is a
  spell/feature-*description* lookup, so it's generic** (correction vs. the original spec).
- **New widget pieces** `ChatToolCard.tsx` (icon + title + chips + collapsible full block) and
  `lib/miniMarkdown.tsx` (~90-line hand-rolled renderer for the ddb markdown subset — **no new
  dependency, no `dangerouslySetInnerHTML`**). `AIChatWidget` carries `cards[]` per assistant
  message; the assistant's prose summary still renders after the cards (cards are additive).
- **Bridge test infra added:** `services/ai-bridge/vitest.config.ts` + a `test` script +
  `vitest` devDep (already in the lockfile; stays out of the Docker image, which filters install
  to dm-screen + scripts).
- **Deferred as planned:** the "Add to Party/Initiative" hand-off buttons are **Phase 4** —
  `fields` is shaped so Phase 4 reads `event.fields` and fires the existing `dm-add-to-initiative`
  CustomEvent without re-parsing. Cards only display in this phase.
- **Live manual pass owed by the DM** (needs an authenticated ddb session + subscription auth):
  monster lookup → rich card w/ AC/HP/CR chips; character lookup → rich card; spell lookup →
  generic card; not-found → card shows the message, no crash. The offline/bridge-stopped path is
  unchanged from Phase 2.

### Model + effort picker ✅ (2026-07-10, Claude Code)

Not one of the numbered phases — a self-contained UX increment: let the DM choose the **model**
and **reasoning effort** per turn from the chat widget, instead of the bridge running a single
env-configured model at the SDK default effort. Design spec:
`docs/superpowers/specs/2026-07-10-ai-chat-model-effort-design.md`. Typecheck clean across all four
packages; **117 tests** (21 bridge + 96 dm-screen) green; production build clean (`grep /api/` and
`grep bridge-protocol` in `dist` both zero).

- **Decided with James (brainstorming, 2026-07-10):** models = **Opus 4.8 / Sonnet 5 / Haiku 4.5**;
  effort = **Low / Medium / High** (the three SDK `effort` levels valid on every model — no
  `xhigh`/`max`, so no per-model gating); defaults **Sonnet 5 + Medium**; **session-only** (plain
  React state — no `dm-` key, no backup/restore surface, resets on remount/reload), consistent with
  the "session-only for v1" stance already taken for chat history; changeable **anytime**, applied
  to the **next** turn including mid-conversation (a picker change never aborts a turn or resets
  the conversation). Placement: two compact dropdowns on the composer footer row.
- **Both knobs are first-class Agent SDK options** (verified in `@anthropic-ai/claude-agent-sdk`):
  `options.model` (string) and `options.effort` (`'low'|'medium'|'high'|'xhigh'|'max'` — "guides
  adaptive-thinking depth"). We expose only the first three effort levels.
- **Wire contract** (`@workspace/bridge-protocol`): the previously-implicit `/chat` request body is
  now the shared `ChatRequest` (`message`, `resume?`, `model?`, `effort?`) + an `EffortLevel` type,
  so producer/consumer drift on these fields is a compile error. Still types-only / erased from the
  bundle.
- **Bridge:** new pure `services/ai-bridge/src/chatRequest.ts` (`parseChatRequest`, 8 unit tests) —
  validates `message`, forwards `resume`/`model` when non-empty, and **drops any out-of-enum
  effort** (`xhigh`/`max`/garbage from a rogue local caller) so the turn falls back to the default.
  `server.ts` routes the body through it; `agent.ts` `runChatTurn` gained `model`/`effort` params —
  a request `model` **overrides** `AI_BRIDGE_MODEL` (env stays the fallback for curl/smoke), and
  `effort` is passed straight to `query({ options })`. An unusable model id surfaces through the
  existing `error` event path (no new failure handling).
- **Widget:** `aiBridge.ts` gained a pure `buildChatBody` helper (3 unit tests) and `streamChat`
  now takes `model`/`effort`; `AIChatWidget.tsx` holds the two session-state values and a local
  `FooterPicker` component. The shared `AnchoredDropdown` gained an opt-in **`autoWidth`** mode
  (size to content, anchor width as a floor, capped to the viewport) — the footer pickers use it so
  the menu isn't clipped to the narrow trigger; all existing autocomplete/combobox callers are
  untouched (default stays match-anchor-width).
- **Live manual pass owed by the DM** (needs subscription auth): the two spec assumptions —
  **(A)** switching model *mid-conversation* applies to the resumed turn (low-risk: even if the SDK
  pinned the model to the resumed session, the change still lands on the next New Chat), and
  **(B)** Haiku 4.5 accepts `high` / Opus 4.8 accepts `low` without an SDK error.

### Phase 4 — data hand-off (chat cards → Party / Initiative) ✅ (2026-07-10, Claude Code)

Design spec: `docs/superpowers/specs/2026-07-10-phase4-data-handoff-design.md`; plan:
`docs/superpowers/plans/2026-07-10-phase4-data-handoff.md`. Typecheck clean across all four
packages; **115 dm-screen tests** (19 new) green; production build clean (`grep /api/` and
`grep bridge-protocol` in `dist` both zero). Implements decision 3 ("preview inline, click to
commit"). The Phase-3 preview cards now carry **hand-off buttons** that push a looked-up creature
or character into the existing Initiative and Party widgets on an explicit click. **No new
persistence, no `dm-*` key, no `bridge-protocol` change** — the buttons map the card's already-parsed
`tool_result.fields` (no markdown re-parsing in the widget).

- **Which card gets which buttons (decided with James):** `monster` → **Add to Initiative** only
  (straight to the combatant list; the bundled bestiary dataset is never mutated — monsters are
  ephemeral, chat-scoped); `character` → **Add to Party** + **Add to Initiative**; `generic` /
  `tool_error` → none.
- **Initiative add = auto-roll d20 (James's call).** Monsters carry no init modifier → plain d20;
  characters → d20 + the card's init bonus. Both are **repeatable** (transient `Added ✓`, button
  stays live) so two goblins is one card, two clicks. Dispatch reuses the existing cancelable
  `dm-add-to-initiative` event with the direct-storage fallback.
- **Party add — name is the only match key** (the card carries no DDB character id). **No existing
  match → adds directly, no form** (James: don't make the DM review when there's nothing to
  reconcile). **Name collision → an inline editable review form** (James: "Replace / Add / Cancel"
  *and* "DM should be able to edit any number before importing"): each shared field (**Level, AC, HP**
  as number inputs; **Class, Race** as text; **Name read-only**) pre-filled from the card, existing
  value shown as a muted `was: N` hint, changed rows highlighted, then **Replace** / **Add as new** /
  **Cancel**. `MAX_PARTY` full → alert.
- **Scope correction surfaced during brainstorming — spell slots / current HP are NOT diffable.**
  Neither the card's parsed `fields` nor the stored `PlayerCharacter` shape carries spell *slots*
  (`spells` is a `string[]` of names) or current HP (party stores only static max; live HP lives in
  the Initiative combatant, where `characterCardToCombatant` already routes the card's `cur`). So the
  party diff covers only what both sides carry — **level/class/race/AC/max-HP**. James chose the
  feasible diff now; slot tracking would be a separate feature (new persisted shape + validator +
  Party UI) and stays out of scope.
- **New pure module** `artifacts/dm-screen/src/lib/cardHandoff.ts` (19 unit tests in
  `cardHandoff.test.ts`): `parseLeadingInt` / `parseHp` field parsers, `monsterCardToCombatant` /
  `characterCardToCombatant` (d20 **injected** for determinism), `characterCardToPlayerDraft` /
  `draftToPlayerInput` (numeric coercion → store input), and `diffPlayer` (changed-only rows). The
  `ToolResultCard` type moved here from `ChatToolCard.tsx` (re-exported there for existing importers)
  so the lib is self-contained with no widget→lib cycle.
- **Targeted refactor** `combatant.ts` gained `addCombatantToInitiative(combatant) → "added" |
  "full" | "error"`, lifting the ~50-line cancelable-dispatch + cap-check + fallback that was inlined
  in `PartyWidget.addToInitiative`. Both the Party per-row add and the new card path now share one
  copy (cap/fallback logic can't diverge). Covered by 4 new `combatant.test.ts` cases (full / consumed
  / fallback-write / unreadable-error).
- **New widget piece** `ChatCardActions.tsx` (button row + collision edit form; returns `null` for
  generic cards), rendered as the last child of `ChatToolCard`. No new dependency, no
  `dangerouslySetInnerHTML`; amber accent + `var(--dm-*)` tokens.
- **Live manual pass owed by the DM** (needs an authenticated ddb session + subscription auth): the
  five checks in the plan's Task 5 — monster→Initiative (incl. repeat add for two goblins),
  character→Party on a new name (direct add), character→Party name collision (form `was:` hints →
  Replace / Add as new / edit-a-number-before-commit), character→Initiative (d20 + bonus, `isPlayer`),
  generic card shows no buttons, and the Initiative-tile-removed fallback path.

### Phase 5 — bundled-data-first rules routing ✅ (2026-07-10, Claude Code)

Design spec: `docs/superpowers/specs/2026-07-10-phase5-bundled-data-first-routing-design.md`; plan:
`docs/superpowers/plans/2026-07-10-phase5-bundled-data-first-routing.md`. Typecheck clean across all
four packages; **136 dm-screen tests** (21 new) green; production build clean (`grep /api/` and
`grep bridge-protocol` in `dist` both zero). Implements decision 4 ("bundled datasets first, ddb-mcp
fallback"): common spell/monster/rule lookups are answered from the bundled datasets **client-side**,
and the chat turn only reaches the bridge when the local data can't answer. **No bridge change, no
`@workspace/bridge-protocol` change, no new `dm-*` key** — local answers are session state like the
rest of the chat.

- **Two routing paths (decided with James):** **slash commands** `/spell`, `/monster`, `/rule` are the
  reliable, explicit path (lenient — exact → card, partial → a "Did you mean" clickable list, none →
  "no match" + an **Ask Selene** escalate button); **free-text auto-detect** is a conservative bonus
  that fires **only on a unique exact name match across the union** of all three datasets (bare entity
  names like `fireball` / `goblin` / `grappled`), with a short leading-filler strip (`what is` /
  `tell me about` / …). Anything sentence-y or non-unique goes to the bridge as before. The offline
  "bridge not running" wall is unchanged — local lookups run in the online path only (James's call).
- **Cards reuse the Phase-3/4 infrastructure.** A locally-found **monster** becomes a `kind:"monster"`
  `ToolResultCard` (`fields: {ac,hp,cr,type,speed}`) rendered by the existing `ChatToolCard`, so it
  carries the Phase-4 **Add to Initiative** hand-off for free; **spells/rules** become `kind:"generic"`
  markdown cards (no hand-off). Each local answer shows an **"Answered from your bundled data"**
  provenance line and an **"Ask Selene instead →"** link that re-runs the original query through the
  bridge, streaming the AI answer **below** the retained card (additive, same turn).
- **New pure module** `artifacts/dm-screen/src/lib/localLookup.ts` (21 unit tests in `localLookup.test.ts`):
  `normalizeQuery`, `parseLookupCommand`, `lookupDataset` (exact + capped substring candidates per
  dataset), `autoDetectLocal` (unique-exact across the union), and card builders `toSpellCard` /
  `toMonsterCard` / `toRuleCard` producing the `cardHandoff` `ToolResultCard` shape (the monster
  builder's `fields` round-trip through `monsterCardToCombatant`, asserted in a test). `/rule` searches
  the union of `compendiumData` + `compendiumRulesData`, matching `CompendiumWidget`.
- **New widget piece** `ChatLocalAnswer.tsx` (provenance line + card / "Did you mean" list / no-match /
  usage hint + escalate link). No new dependency, no `dangerouslySetInnerHTML`.
- **`AIChatWidget.tsx`** now routes each message through local lookup first; the bridge-streaming half
  of `send()` was extracted into a reusable `streamTurn(text, targetIndex)` shared by a fresh send and
  the escalation path, writing through an **index-targeted** `updateAssistantAt(index, fn)` (the old
  last-message-only `updateLastAssistant` was removed). `AssistantMessage` gained `local?` /
  `sourceQuery?` / `escalated?`; `escalate(index, query)` targets the clicked card's own message.
  Empty-state hint now mentions the slash commands.
- **Whole-feature review (opus) caught one Critical, fixed + re-reviewed clean:** escalation originally
  wrote to the *last* assistant message (via `updateLastAssistant`), so "Ask Selene instead" on an
  **older** local answer streamed the reply into the wrong bubble. Root cause was a **plan** defect —
  the plan under-specified the spec's `escalate(messageIndex)` to a last-message helper. Fixed by
  threading the message index through `escalate`/`streamTurn`/`updateAssistantAt`.
- **Live manual pass owed by the DM:** `/spell fireball` → spell card; `/monster goblin` → monster card
  with Add to Initiative (adds a Goblin combatant); `/rule grappled` → rule card; `/spell fire` → "Did
  you mean" list; `/spell zzzz` → no-match + Ask Selene; bare `goblin` → monster card; a sentence
  question still streams from the bridge; "Ask Selene instead" streams the AI answer below the retained
  card (including on an **earlier** answer, not just the latest — the index-targeting fix above).

### Phase 5 hardening — code review pass ✅ (2026-07-11, Claude Code)

`/code-review high` on the Phase-5 diff surfaced five findings; the four real ones are fixed, plus the
abort race that was previously logged as a known follow-up. Typecheck clean; **136 dm-screen tests**
still green (no test changes — all fixes are internal to the widget/lib). All in
`AIChatWidget.tsx` / `ChatLocalAnswer.tsx` / `localLookup.ts`.

1. **Broken streaming on every bridge turn (Critical, introduced by the Phase-5 refactor).** `send()`
   computed the assistant message's `targetIndex` **inside a `setMessages` updater's side-effect**
   (`targetIndex = prev.length + 1`) and then read it on the next line. Because the immediately-preceding
   `setInput("")` marks the fiber dirty, React 18's eager-state shortcut is skipped and the updater does
   **not** run before `streamTurn(text, targetIndex)` — so `targetIndex` stayed `-1`, every
   `updateAssistantAt(-1, …)` no-op'd, and the assistant bubble spun forever with no text. Fixed with a
   `messagesRef` (mirrors `messages` every render) read **synchronously**: `targetIndex =
   messagesRef.current.length + 1`. The ref also fixes the latent stale-`messages`-closure problem (a
   local answer mutates `messages` without re-creating `send`).
2. **Escalation ignored a picked "Did you mean" candidate.** After the DM clicked a candidate chip, "Ask
   Selene instead" still escalated the original `sourceQuery`. `ChatLocalAnswer` now tracks the picked
   `{name, card}` and `onEscalate(query?)` sends the chosen entity's name (falls back to `sourceQuery`
   when nothing was picked).
3. **Double-fire race on Send/Enter.** The `if (sending) return` guard read render-lagged state, so a
   fast double Enter/click could launch two turns (duplicate user message, two `AbortController`s
   racing). Added a synchronous `sendingRef` set the instant a bridge turn begins (cleared in
   `streamTurn`'s `finally` and in `newChat`); `send`/`escalate` guard on it. `sending` **state** is kept
   for the composer UI only.
4. **Silent last-wins on a normalized monster-name collision.** `monsterByName` is now built **first-wins**
   (verified the current 2,160-entry dataset has **zero** normalized collisions — this is defensive
   hardening so a future regen with a dup name stays deterministic).
5. **The `newChat()`-mid-stream abort race (the old "known follow-up") is now hardened.** Each
   `streamTurn` treats its own `AbortController` as an identity token (`isCurrent = () => abortRef.current
   === abort`) and gates **every** turn-global and index-targeted write on still being current: the event
   callback early-returns, and the `catch`/`finally` skip teardown when superseded. This closes the real
   clobber — because `newChat` clears the message list *and* `sendingRef` synchronously, a superseded
   turn's late settlement could otherwise write "Cancelled"/error into the **reused** `targetIndex`
   (now a *new* turn's message) and null the new turn's `abortRef` (wedging its Stop button). The current
   turn's own Stop is unaffected (`stop()` aborts without nulling `abortRef`, so `isCurrent()` stays true).
6. **Investigated, no change — free-text auto-detect false positives (finding #5, low).** Testing ~40
   common words showed the ones that resolve locally (`hide`, `dodge`, `grapple`, `light`, `fear`, `aid`, …)
   are legitimate combat actions / conditions / spells the feature exists to serve; any trailing words
   defeat the exact match and fall through to the bridge; and every local answer already carries the
   provenance line + "Ask Selene instead" escape hatch. A denylist would regress the core value and be
   arbitrary, so the unique-exact-across-datasets gate stands.

### Phase 6 — chat history persistence ✅ (2026-07-11, Claude Code)

Design spec: `docs/superpowers/specs/2026-07-11-phase6-chat-history-persistence-design.md`; plan:
`docs/superpowers/plans/2026-07-11-phase6-chat-history-persistence.md`. Workspace typecheck clean
across all four packages; **148 dm-screen tests** (12 new) + 21 bridge tests green; production build
clean (`grep /api/` and `grep bridge-protocol` in `dist` both zero, `dm-ai-chat-v1` present as
expected). Resolves the handover's open "chat history persistence" question. **No bridge, no
`@workspace/bridge-protocol`, no migration** (new key, no legacy data) — entirely client-side.

- **Decided with James (brainstorming, 2026-07-11):** **persist** the transcript (previously
  session-only React state); **transcript-only** — the visible messages persist but the bridge's
  Agent-SDK `resume` session id does **not**, so a reload shows history while the next turn starts a
  fresh bridge session (the SDK session lives in the bridge process's memory and would usually be dead
  after a reload/restart anyway); **backup-exposure handling = both** mitigations, because the
  full-backup sweep round-trips every `dm-*` key into a shareable file and chat can echo D&D Beyond
  content — (a) the "New chat" reset also wipes the persisted key so the DM can clear before exporting,
  and (b) a conditional export-time warning line.
- **New key** `dm-ai-chat-v1` (versioned, `dm-`-prefixed → auto-swept by the full backup).
- **New pure module** `artifacts/dm-screen/src/lib/chatHistory.ts` (11 unit tests in `chatHistory.test.ts`):
  owns `CHAT_HISTORY_KEY`, `MAX_CHAT_MESSAGES = 200` (count cap like `MAX_COMBATANTS`/`MAX_PARTY`,
  keep-most-recent on overflow; the import path's 2 MB `MAX_RAW_VALUE_BYTES` is the byte backstop),
  the chat message types **moved here** from `AIChatWidget.tsx`, `LocalAnswer` **moved here** from
  `ChatLocalAnswer.tsx` (which re-exports it), and `validateChatHistory` / `validateCard` /
  `validateLocalAnswer` / `hasPersistedChat`. The validator is a `ShapeValidator<ChatMessage[]>` run on
  **both** the `useLocalStorage` read path and the `backup.ts` import path: rejects non-arrays, caps to
  the most-recent 200, drops malformed entries (and malformed nested cards/local pieces individually),
  **forces every restored assistant message `pending:false`**, and drops a trailing content-less
  assistant message (a dead in-flight turn snapshotted mid-stream). Types moved into a React-free module
  so `backup.ts` (and its Node test) never import a widget `.tsx`.
- **Widget** `AIChatWidget.tsx`: swapped `useState<ChatMessage[]>([])` → `useLocalStorage(CHAT_HISTORY_KEY,
  [], validateChatHistory, { debounceWriteMs: 500 })`. The hook already debounces (streaming no longer
  writes per token) and flushes on pagehide / tab-hidden / unmount / before a backup sweep. `newChat()`'s
  `setMessages([])` now also clears the key. `sessionIdRef` stays session-only (transcript-only).
- **`backup.ts`**: registered `"dm-ai-chat-v1": lift(validateChatHistory)` (1 new round-trip test in
  `backup.test.ts`). **`Sidebar.tsx`**: an amber "⚠ Includes AI-chat transcripts (may contain D&D Beyond
  content)" line under the BACKUP description, shown only when `hasPersistedChat()`.
- **Live manual pass owed by the DM** (needs a running bridge): send a turn → reload → transcript
  restored, no ghost "Thinking…", next turn starts fresh; "New chat" clears it (and stays cleared after
  reload); backup export shows the warning + includes `dm-ai-chat-v1` when a transcript exists, omits
  both after New chat; import round-trips. Automated verification (typecheck / tests / build / bundle
  scan) is done.

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
3. **Structured tool-result rendering** — ✅ **DONE (2026-07-09, see Progress log).** Bridge
   parses ddb-mcp markdown/plain-text results into a typed `tool_result` event (monster/character
   rich, rest generic) with graceful degradation to raw markdown; widget renders preview cards
   (`ChatToolCard` + `miniMarkdown`) instead of raw prose.
4. **Data hand-off** — ✅ **DONE (2026-07-10, see Progress log).** "Add to Party" / "Add to
   Initiative" buttons on the preview cards, wired via the existing `dm-add-to-initiative`
   `CustomEvent` (shared `addCombatantToInitiative` helper) and `partyStore`. Party name-collision
   opens an editable review form (Replace / Add as new / Cancel) diffing level/class/race/AC/max-HP;
   no match → direct add. Monsters → Initiative only. Pure logic in `lib/cardHandoff.ts` (19 tests).
5. **Bundled-data-first rules routing** — ✅ **DONE (2026-07-10, see Progress log).** Client-side
   lookup over `spells.ts` / `monsters.ts` / `compendium*.ts` via slash commands (`/spell`, `/monster`,
   `/rule`) and conservative unique-exact free-text auto-detect, before a chat turn is sent to the
   bridge. Pure logic in `lib/localLookup.ts` (21 tests); monster cards reuse the Phase-4 Add-to-
   Initiative hand-off; each local answer offers "Ask Selene instead". No bridge/protocol/`dm-*` change.
6. **Chat history decision + implementation** — ✅ **DONE (2026-07-11, see Progress log).** Persist the
   transcript in a versioned `dm-ai-chat-v1` key (transcript-only — no resume session id), with a shared
   `validateChatHistory` cap/normalizer run on both the `useLocalStorage` read path and the backup import,
   plus both backup-exposure mitigations (New chat clears the key; conditional export-time warning). Pure
   logic in `lib/chatHistory.ts` (11 tests). No bridge/protocol/migration change.
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
