# @workspace/ai-bridge

**Optional** local bridge that powers the dm-screen **AI Chat widget**. It runs a
[Claude Agent SDK](https://code.claude.com/docs/en/agent-sdk) session with the
sibling [`ddb-mcp`](https://github.com/iamjameslennon/ddb-mcp) D&D Beyond MCP
server attached over stdio, restricted to **read-only** lookups.

This is a deliberate, scoped exception to the "one static artifact, no backend"
architecture: it is **not** part of the SPA build or the Docker image, and the
core app works fully without it. The **AI Chat** widget degrades to an "AI bridge
not running" state when it is stopped.

## Prerequisites

- **ddb-mcp comes bundled.** The published [`@iamjameslennon/ddb-mcp`](https://www.npmjs.com/package/@iamjameslennon/ddb-mcp)
  npm package is a pinned dependency, installed by `pnpm install` — no clone or
  build required. (Developing ddb-mcp itself? Point `DDB_MCP_ENTRY` at a local
  clone's `dist/index.js` to override.)
- **A D&D Beyond session on disk** is needed for live lookups. Run `ddb_login`
  yourself **once** (e.g. with ddb-mcp attached to Claude Code, or
  `npx @iamjameslennon/ddb-mcp`) to write `~/.config/ddb-mcp/session.json`; that
  step needs Playwright browsers (`npx playwright install`). The bridge never
  triggers login and never launches a browser — it only makes browserless
  read-only calls. General rules Q&A works without any of this.

  **When the saved session expires**, live ddb lookups start failing — this is a
  one-time **setup** error, not something the bridge (or the chat model) retries.
  Re-run `ddb_login` yourself, the same way you did the first time, to refresh
  `session.json`; the chat flow never re-authenticates on its own. Bundled-data
  and general Q&A keep working while the session is stale — only the live D&D
  Beyond lookups are affected.
- **A Claude subscription** reachable by the Agent SDK — either an interactive
  `claude` login, or a token from `claude setup-token` exported as
  `CLAUDE_CODE_OAUTH_TOKEN`.

## Run

From the repo root, `pnpm dev` starts the SPA (`:38080`) **and** this bridge
(`:38900`) together in parallel — one command. Use `pnpm dev:app` for the SPA
alone (the bridge is always optional), or `pnpm dev:ai` for the bridge alone.

```bash
pnpm dev        # SPA + bridge together (from repo root)
pnpm dev:ai     # bridge only — watch mode on http://127.0.0.1:38900

pnpm --filter @workspace/ai-bridge run start   # one-shot, no watch

# Smoke-test one turn without the HTTP layer:
pnpm --filter @workspace/ai-bridge run smoke -- "How does Grapple work in 2024 rules?"
```

## Endpoints (localhost only)

| Method | Path      | Purpose |
|--------|-----------|---------|
| `GET`  | `/health` | Reachability + billing mode + ddb-mcp status. Used by the widget to detect "bridge not running". |
| `POST` | `/chat`   | Body `{ "message": "...", "resume"?: "<sessionId>", "model"?: "...", "effort"?: "low"\|"medium"\|"high" }`. Streams Server-Sent Events: `text`, `tool`, `tool_result`, `tool_error`, `done`, `error`. Pass the previous turn's `done.sessionId` back as `resume` to continue the conversation; `model`/`effort` are chosen per-turn by the widget's composer pickers (an out-of-enum `effort` is dropped, a request `model` overrides `AI_BRIDGE_MODEL`). |

The `tool` event is a lightweight "calling `<tool>`…" indicator; the richer
`tool_result` event carries a parsed, typed result (`kind: "monster" | "character"
| "generic"`, with best-effort `fields` **and** always the full raw `markdown`) so
the widget can render a preview card — and, for monster/character results, the
"Add to Initiative / Party" hand-off buttons — instead of leaving the stat block
in prose. A ddb format drift degrades gracefully (fields drop, the raw block still
renders). When the SDK marks a tool call as failed, the bridge emits `tool_error`
(with the tool name + message) **instead of** `tool_result`, so the widget can
show the failure on its own card rather than burying it in prose.

The event/health shapes (`BridgeEvent`, `BridgeHealth`) are defined once in the
shared, types-only [`@workspace/bridge-protocol`](../../packages/bridge-protocol)
package and imported by both this bridge and the widget, so producer/consumer
drift is a compile error. The socket bytes are still untrusted at runtime — the
widget validates each SSE record shape before use (`parseSseRecord` in
`artifacts/dm-screen/src/lib/aiBridge.ts`). A client that closes the connection
mid-turn (Stop button, closed tile) aborts the in-flight Agent turn; the server
guards every write on `res.writable`, so a disconnect can't crash it.

## Billing / auth

By default the bridge draws on your **Claude subscription** and refuses to touch
metered API billing: it strips `ANTHROPIC_API_KEY` / `ANTHROPIC_AUTH_TOKEN` from
the SDK environment. To deliberately use a metered API key instead, set
`AI_BRIDGE_ALLOW_API_KEY=1` (and `ANTHROPIC_API_KEY`).

| Env var | Default | Meaning |
|---------|---------|---------|
| `AI_BRIDGE_PORT` | `38900` | Listen port (host is always `127.0.0.1`). The AI Chat widget reads the same var at dev/build time (`vite.config.ts` bakes it into `BRIDGE_URL`), so `AI_BRIDGE_PORT=39000 pnpm dev` moves both sides together. Docker additionally pins the CSP `connect-src` to `:38900` (`docker/security-headers.conf`) — edit that too for a custom port there. |
| `AI_BRIDGE_ALLOWED_ORIGINS` | unset | Extra browser origins allowed to call the bridge, comma-separated (the SPA's `http://{localhost,127.0.0.1}:38080` are always allowed). Needed when the SPA is served anywhere else — a custom `PORT`, a reverse proxy — or the bridge 403s it and the widget shows "AI bridge refused this page". |
| `DDB_MCP_ENTRY` | bundled npm package | Override to a local ddb-mcp clone's `dist/index.js`. |
| `AI_BRIDGE_MODEL` | SDK default | Optional model override. |
| `AI_BRIDGE_TURN_TIMEOUT_MS` | `180000` (3 min) | Wall-clock budget per chat turn. A wedged turn is aborted at the deadline so it can't pin the single-turn slot forever (which would 429 all further chat until restart). Raise for very slow hosts; a non-positive/unparseable value keeps the default. |
| `AI_BRIDGE_ALLOW_API_KEY` | unset | Opt in to metered `ANTHROPIC_API_KEY` billing. |
| `CLAUDE_CODE_OAUTH_TOKEN` | unset | Subscription token from `claude setup-token`. |

## Security

- Binds `127.0.0.1` only — never `0.0.0.0`.
- The model can call only a fixed **read-only** allowlist of ddb-mcp tools
  (`src/ddbTools.ts`); every other ddb-mcp tool (login, download, browser
  navigation/interaction) is denied by the Agent SDK `canUseTool` gate, and the
  built-in filesystem/exec/network tools are removed outright (`tools: []` +
  `disallowedTools` in `src/agent.ts` — layered so an auto-permitted read-only
  built-in can never bypass `canUseTool`). Regression-pinned in `agent.test.ts`.
- ddb-mcp is consumed only through the standard MCP tool interface, preserving
  its `<untrusted_dndbeyond_content>` prompt-injection wrapping.
