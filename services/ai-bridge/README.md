# @workspace/ai-bridge

**Optional** local bridge that powers the dm-screen **AI Chat widget**. It runs a
[Claude Agent SDK](https://code.claude.com/docs/en/agent-sdk) session with the
sibling [`ddb-mcp`](https://github.com/iamjameslennon/ddb-mcp) D&D Beyond MCP
server attached over stdio, restricted to **read-only** lookups.

This is a deliberate, scoped exception to the "one static artifact, no backend"
architecture: it is **not** part of the SPA build or the Docker image, and the
core app works fully without it. The chat widget alone degrades to an "AI bridge
not running" state when it is stopped. (Phase 1 scaffold — the widget lands in a
later phase.)

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
| `POST` | `/chat`   | Body `{ "message": "..." }`. Streams Server-Sent Events: `text`, `tool`, `done`, `error`. |

## Billing / auth

By default the bridge draws on your **Claude subscription** and refuses to touch
metered API billing: it strips `ANTHROPIC_API_KEY` / `ANTHROPIC_AUTH_TOKEN` from
the SDK environment. To deliberately use a metered API key instead, set
`AI_BRIDGE_ALLOW_API_KEY=1` (and `ANTHROPIC_API_KEY`).

| Env var | Default | Meaning |
|---------|---------|---------|
| `AI_BRIDGE_PORT` | `38900` | Listen port (host is always `127.0.0.1`). |
| `DDB_MCP_ENTRY` | bundled npm package | Override to a local ddb-mcp clone's `dist/index.js`. |
| `AI_BRIDGE_MODEL` | SDK default | Optional model override. |
| `AI_BRIDGE_ALLOW_API_KEY` | unset | Opt in to metered `ANTHROPIC_API_KEY` billing. |
| `CLAUDE_CODE_OAUTH_TOKEN` | unset | Subscription token from `claude setup-token`. |

## Security

- Binds `127.0.0.1` only — never `0.0.0.0`.
- The model can call only a fixed **read-only** allowlist of ddb-mcp tools
  (`src/ddbTools.ts`); every other ddb-mcp tool (login, download, browser
  navigation/interaction) and all built-in filesystem/exec tools are hard-denied
  via the Agent SDK `canUseTool` gate.
- ddb-mcp is consumed only through the standard MCP tool interface, preserving
  its `<untrusted_dndbeyond_content>` prompt-injection wrapping.
