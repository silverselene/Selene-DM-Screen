# AI Chat: model & effort selection

**Date:** 2026-07-10
**Status:** Approved (design)
**Area:** `artifacts/dm-screen` (AI Chat widget), `services/ai-bridge`, `packages/bridge-protocol`

## Problem

The AI Chat widget always runs whatever model the bridge is configured for
(`AI_BRIDGE_MODEL` env, else the Agent SDK / subscription default) at the SDK's
default reasoning effort. The DM has no way, from the dashboard, to trade speed
for depth on a per-question basis — a quick monster lookup and a gnarly rules
adjudication get the same treatment. We want two in-widget selectors: **model**
and **effort**.

## Decisions (from brainstorming)

| Decision | Choice |
|---|---|
| Model menu | Opus 4.8 (`claude-opus-4-8`), Sonnet 5 (`claude-sonnet-5`), Haiku 4.5 (`claude-haiku-4-5-20251001`) |
| Effort menu | Low / Medium / High (maps to SDK `effort`; all valid on every model, no gating) |
| Defaults | Sonnet 5 + Medium |
| Persistence | Session-only React state — no `localStorage`, no `dm-` key, no backup/restore surface, no key-version bump |
| When a change applies | Anytime; new values ride the **next** `send()`, including mid-conversation |
| UI placement | Two compact dropdowns on the composer footer row (the current "Bridge online · …" status line) |

## Feasibility grounding

The Claude Agent SDK `query({ options })` exposes both knobs as first-class
options (verified in `@anthropic-ai/claude-agent-sdk/sdk.d.ts`):

- `model?: string`
- `effort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max'` — "Controls how much
  effort Claude puts into its response. Works with adaptive thinking to guide
  thinking depth." We expose only `low`/`medium`/`high`, which are unconstrained
  by model.

## Design

### 1. Wire contract — `packages/bridge-protocol/src/index.ts`

Today only the **response** types (`BridgeEvent`, `BridgeHealth`) are shared; the
`/chat` **request** body (`{ message, resume }`) is implicit on both sides.
Formalize it so a producer/consumer drift on the new fields is a compile error:

```ts
/** Reasoning-effort levels the widget exposes (subset of the SDK's EffortLevel). */
export type EffortLevel = "low" | "medium" | "high";

/** Request body of the bridge's `POST /chat`. */
export interface ChatRequest {
  message: string;
  /** Continue a prior turn's Agent-SDK session (keeps context). */
  resume?: string;
  /** Model id. Omitted → bridge falls back to AI_BRIDGE_MODEL / SDK default. */
  model?: string;
  /** Reasoning effort. Omitted → SDK default. */
  effort?: EffortLevel;
}
```

- Package stays **types-only / zero-runtime** — `ChatRequest` and `EffortLevel`
  are `import type`d on both sides and erased from the browser bundle (the
  existing `grep -r bridge-protocol dist/public/assets` → 0 invariant holds).
- The concrete **model catalog (ids + human labels) is NOT shared** — it is a UI
  concern and lives only in the widget. The bridge forwards `model` opaquely, so
  no runtime allowlist is added to the types-only package.

### 2. Bridge — `services/ai-bridge`

**`server.ts` `handleChat`:**
- Widen the parsed body to read optional `model` and `effort`.
- `model`: accept when it's a non-empty string; otherwise leave undefined.
- `effort`: accept only when it is exactly `"low" | "medium" | "high"`; any other
  value (including `xhigh`/`max`/garbage from a rogue local caller) is ignored
  and left undefined, falling back to the SDK default. This keeps the bridge
  fail-safe without a shared runtime enum.
- Pass both into `runChatTurn(message, abort, resume, model, effort)`.

**`agent.ts` `runChatTurn`:**
- New signature: `runChatTurn(message, abortController?, resumeSessionId?, model?, effort?)`.
- Model precedence: `const chosenModel = model ?? config.model;` — a request
  `model` **overrides** the `AI_BRIDGE_MODEL` env, which remains the fallback for
  non-widget callers (curl, the in-process smoke test). Then
  `...(chosenModel ? { model: chosenModel } : {})` (replaces the current
  `config.model`-only spread at agent.ts:79).
- Effort: `...(effort ? { effort } : {})` added to `query({ options })`.
- No new error handling: an invalid model id (e.g. a typo, or a model the
  subscription can't use) already surfaces through the existing `catch → yield {
  type: "error" }` path and renders as an inline error bubble in the widget.

### 3. Widget — `artifacts/dm-screen/src/lib/aiBridge.ts`

- `streamChat` gains two params so callers can set them per turn:
  `streamChat(message, onEvent, signal?, resumeSessionId?, model?, effort?)`.
- Body construction includes `model`/`effort` when provided:
  `JSON.stringify({ message, ...(resume ? { resume } : {}), ...(model ? { model } : {}), ...(effort ? { effort } : {}) })`.
- Import `EffortLevel` (type-only) from `@workspace/bridge-protocol` and
  re-export it, mirroring the existing `BridgeEvent`/`BridgeHealth` re-exports.

### 4. Widget — `artifacts/dm-screen/src/components/widgets/AIChatWidget.tsx`

- **Model catalog** — a small module-level const, the single source of truth for
  the menu:
  ```ts
  const MODELS = [
    { id: "claude-opus-4-8", label: "Opus 4.8" },
    { id: "claude-sonnet-5", label: "Sonnet 5" },
    { id: "claude-haiku-4-5-20251001", label: "Haiku 4.5" },
  ] as const;
  const EFFORTS: { id: EffortLevel; label: string }[] = [
    { id: "low", label: "Low" },
    { id: "medium", label: "Medium" },
    { id: "high", label: "High" },
  ];
  ```
- **State:** `const [model, setModel] = useState("claude-sonnet-5");` and
  `const [effort, setEffort] = useState<EffortLevel>("medium");` — plain React
  state (session-only; resets on remount / reload by design).
- **Send path:** pass `model` and `effort` through to `streamChat(...)`. Nothing
  else in the send/stream/resume flow changes — switching model/effort does
  **not** abort an in-flight turn, does **not** clear history, and does **not**
  drop the resume session id; it only changes what the *next* `send()` transmits.
- **UI:** two compact dropdowns on the composer footer row (currently the
  "Bridge online · {billing}" line under the textarea). Use the app's
  `AnchoredDropdown` (`src/lib/AnchoredDropdown.tsx`) so each menu portals out of
  the tile's `overflow: hidden`, themed with the existing `--dm-*` vars to match
  the widget. The bridge-online health indicator remains on the same row
  (condensed as needed) so the status signal is not lost.
- Selectors are always enabled (including mid-turn); no disabled/gated states.

## Non-goals / YAGNI

- No persistence, no `dm-` localStorage key, no key-version bump, no
  backup/restore validator entry.
- No `xhigh`/`max` effort, no Fable 5, no per-model effort gating.
- No surfacing of the bridge's configured default model in `/health` (default is
  a fixed Sonnet 5 in the widget, not "whatever the bridge runs").
- No thinking-token / `thinking` config UI — only the `effort` knob.

## Assumptions to verify during implementation

- **A. Mid-conversation model switch.** Passing a different `model` on a
  **resumed** session is expected to apply to the continuing turn. Low-risk: even
  if the SDK were to pin the model to the resumed session, the change still lands
  on the next New Chat — acceptable either way. Verify by switching model
  mid-conversation and confirming the next turn's behavior/telemetry.
- **B. Effort on every model.** `low`/`medium`/`high` are documented as
  unconstrained by model; confirm Haiku 4.5 accepts `high` and Opus 4.8 accepts
  `low` without an SDK error.

## Verification

- `pnpm typecheck` (whole workspace — catches any `ChatRequest`/`EffortLevel`
  drift across the three packages).
- `pnpm --filter @workspace/ai-bridge run test` and
  `pnpm --filter @workspace/dm-screen run test` (existing pure-logic suites; add
  coverage for the new effort-validation branch in the bridge body parser and for
  `streamChat` body construction if a seam allows).
- `pnpm build` + bundle scan: `grep -r bridge-protocol dist/public/assets` → 0
  (types-only invariant preserved).
- Manual: with `pnpm dev`, switch model + effort in the widget, send a turn,
  confirm the reply and that the bridge received the chosen values (log/telemetry);
  exercise assumptions A and B.
