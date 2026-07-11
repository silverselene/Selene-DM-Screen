# Phase 6 — AI Chat history persistence — design

Status: **design approved (2026-07-11)**, ready for an implementation plan.
Part of the AI Chat widget epic (`HANDOVER-ai-chat-widget.md`, phase 6 of 9).

## Problem

The AI Chat widget's transcript currently lives in plain React state
(`AIChatWidget.tsx`: `useState<ChatMessage[]>([])`). It is lost whenever the
tile is closed/reopened or the page reloads. Phase 6 is the handover's
deliberately-deferred "chat history decision + implementation" (see the open
question at `HANDOVER-ai-chat-widget.md`, "Chat history persistence").

The decision is not free: chat responses can echo D&D Beyond character/campaign
content, and the full-backup sweep in `src/lib/backup.ts` round-trips **every**
`dm-*` localStorage key verbatim into a JSON file the DM might share. So
persisting the transcript deliberately puts DDB-derived text into a shareable
artifact, and that exposure must be handled, not ignored.

## Decisions (brainstormed with James, 2026-07-11)

1. **Persist the transcript.** Add a versioned `dm-ai-chat-v1` key so the chat
   survives reload and tile close/reopen, with a cap + validator + full-backup
   coverage — the same discipline every other `dm-*` key gets.
2. **Backup-exposure handling = both** of the mitigations discussed:
   - **Easy clear:** the existing "New chat" reset also wipes the persisted key,
     so a DM can clear the transcript before exporting a backup.
   - **Export-time warning:** the sidebar BACKUP panel shows a note that the
     backup may include AI-chat transcripts with D&D Beyond content — **only when
     a transcript actually exists** (no noise on a fresh install / empty chat).
3. **Transcript-only (do NOT persist the resume session id).** The visible
   message history is persisted; the bridge's Agent-SDK `resume` session id is
   not. After a reload the DM sees past turns, but the next turn starts a **fresh
   bridge session** with no prior model-side context. Rationale: the Agent-SDK
   session lives in the bridge process's memory, so a reload (which usually
   coincides with the DM restarting the bridge) would leave the id dead anyway;
   not persisting it avoids replaying a guaranteed-dead `resume` id and keeps the
   post-reload behavior honest and simple.

## Non-goals

- **No migration.** `dm-ai-chat-v1` is a brand-new key with no legacy data;
  session-state → persisted is purely additive. Nothing to copy forward, so no
  entry in `migrations.ts`.
- **No persisted resume/session id** (decision 3).
- **No bridge or `@workspace/bridge-protocol` change.** Phase 6 is entirely
  client-side (dm-screen) — persistence, a validator, and two small UI wirings.
- **No new byte cap machinery** beyond a message-count cap; the import path's
  existing `MAX_RAW_VALUE_BYTES` (2 MB) is the byte backstop, consistent with
  how other list keys are bounded.

## Architecture

### New key

`dm-ai-chat-v1` — versioned per the CLAUDE.md convention; `dm-` prefixed so the
full-backup sweep (`readAllDmKeys` in `backup.ts`) picks it up automatically.

### New pure module: `artifacts/dm-screen/src/lib/chatHistory.ts`

Mirrors the existing pure-lib pattern (`cardHandoff.ts`, `localLookup.ts`):
pure, no React, unit-tested in a sibling `chatHistory.test.ts` (Node env, no
jsdom). It owns:

- **The message types, moved here** so the validator's types do not live in a
  `.tsx` (which would force `backup.ts` — and its Node test — to import widget
  code):
  - `UserMessage`, `AssistantMessage`, `ChatMessage` — **moved from
    `AIChatWidget.tsx`**, which now re-imports them.
  - `LocalAnswer` — **moved from `ChatLocalAnswer.tsx`**, which now re-imports
    it. (`ToolResultCard` already lives in the pure `cardHandoff.ts`, so no move
    needed for it; `chatHistory.ts` imports the type from there.)
- `CHAT_HISTORY_KEY = "dm-ai-chat-v1"`.
- `MAX_CHAT_MESSAGES = 200` (≈ 100 turns). Count-based cap like `MAX_COMBATANTS`
  / `MAX_PARTY`. On overflow, keep the **most-recent** `MAX_CHAT_MESSAGES`
  (slice from the end). No per-message text-length cap — the count cap plus the
  import path's `MAX_RAW_VALUE_BYTES` (2 MB) backstop bound the stored size, and
  a per-message cap would risk truncating a legitimately long AI answer.
- `validateChatHistory(parsed: unknown): ChatMessage[] | undefined` — a
  `ShapeValidator<ChatMessage[]>` (returns cleaned value, or `undefined` to mean
  "fall back to default `[]`"; never throws), suitable for **both** the
  `useLocalStorage` read path and the `backup.ts` import path:
  - Non-array → `undefined`.
  - Slice to the last `MAX_CHAT_MESSAGES` entries.
  - Per entry, by `role`:
    - **`"user"`**: require a string `text`; emit `{ role: "user", text }`.
      Drop the entry if `text` isn't a string.
    - **`"assistant"`**: coerce/sanitize each field —
      - `text` → string (default `""`)
      - `tools` → `string[]` (filter non-strings)
      - `cards` → `ToolResultCard[]` via a `validateCard` helper (drop malformed
        cards individually; keep the message)
      - `toolErrors` → `{ tool: string; message: string }[]` (filter malformed)
      - `error` → optional string
      - `local` → optional `LocalAnswer` via a `validateLocalAnswer` helper
        (drop if malformed; keep the message)
      - `sourceQuery` → optional string
      - `escalated` → optional boolean
      - **`pending` → forced `false`** (a debounced write can capture an
        in-flight turn; on load nothing is streaming).
    - **Unknown role** → drop the entry.
  - Drop a **trailing content-less assistant message** (no `text`, `cards`,
    `toolErrors`, `local`, or `error`) — a dead in-flight turn snapshotted
    mid-stream — so reload doesn't show an empty assistant bubble.
- `validateCard(parsed): ToolResultCard | undefined` — requires
  `type === "tool_result"`, `kind ∈ {monster, character, generic}` (unknown kind
  coerced to `generic`, matching `isBridgeEvent`), string `title`, string
  `markdown`, string `tool`, and `fields` as an optional `Record<string,string>`
  (drop non-string field values).
- `validateLocalAnswer(parsed): LocalAnswer | undefined` — validates the
  `{ card?, candidates?, noMatch?, hint? }` union: `card`/`candidates[].card`
  through `validateCard`, `candidates[].name` a string, `noMatch`/`hint`
  strings. Drop a candidate whose card fails; drop the whole `local` only if
  nothing valid remains.
- `hasPersistedChat(): boolean` — reads `dm-ai-chat-v1`, returns true iff it
  parses to a non-empty array. Used by the Sidebar warning. Cheap enough to call
  in render.

### `backup.ts` — register the validator

Add to `KEY_VALIDATORS`:

```ts
"dm-ai-chat-v1": lift(validateChatHistory),
```

`validateChatHistory` is imported from `chatHistory.ts`, the same way
`validateCombatants` is imported from `combatant.ts`. No widget/React import
enters `backup.ts` because the types were moved into the pure module. `lift`
already wraps the shape validator with `JSON.parse` / `JSON.stringify`, and the
generic caps (`MAX_RAW_VALUE_BYTES`, `MAX_TOTAL_BYTES`) apply as they do to
every key.

### `AIChatWidget.tsx` — persist via the hook

- Replace `const [messages, setMessages] = useState<ChatMessage[]>([])` with:

  ```ts
  const [messages, setMessages] = useLocalStorage<ChatMessage[]>(
    CHAT_HISTORY_KEY,
    [],
    validateChatHistory,
    { debounceWriteMs: 500 },
  );
  ```

  The hook already: reads + validates at mount (forcing `pending:false` and
  healing storage), debounces writes so streaming does **not** write per token,
  and flushes the pending write on `pagehide` / tab-hidden / unmount / before a
  backup sweep (via the `pendingWrites` registry). No manual persistence code in
  the widget.
- Import `ChatMessage`/`UserMessage`/`AssistantMessage` (and `LocalAnswer` where
  referenced) from `chatHistory.ts` instead of defining them locally.
- `newChat()` is unchanged in shape — its `setMessages([])` now also clears the
  persisted key (debounced, but flushed before any export, so "New chat → Export"
  never leaks the just-cleared transcript).
- `sessionIdRef` stays session-only (decision 3): it initializes to `null` on
  mount, so the first post-reload turn starts a fresh bridge session.
- Everything else (`messagesRef`, `streamTurn`, `escalate`, `updateAssistantAt`,
  the send/abort guards) operates on `messages` / `setMessages` and is untouched.

### `Sidebar.tsx` — conditional export-time warning

In the BACKUP panel, under the existing description `<p>`, render a small amber
note **only when `hasPersistedChat()` is true**:

> ⚠ Includes AI-chat transcripts (may contain D&D Beyond content).

Read `hasPersistedChat()` in render (cheap localStorage read; the panel already
re-renders on sidebar interactions). Styling uses the existing `var(--dm-*)`
tokens / amber accent already used for the AI-chat widget.

## Testing

New `artifacts/dm-screen/src/lib/chatHistory.test.ts` (Node env, no jsdom;
matches the Tier-1 pure-logic convention):

- valid mixed transcript round-trips unchanged (aside from `pending:false`)
- over-cap transcript is trimmed to `MAX_CHAT_MESSAGES`, keeping the most-recent
- an assistant message persisted with `pending:true` loads with `pending:false`
- a message with a malformed card keeps the message but drops the bad card
- an unknown-role entry is dropped
- a trailing content-less assistant message is dropped
- a non-array value → `undefined`
- `hasPersistedChat()` returns false for missing/empty/`[]`, true for a
  non-empty array

Extend `backup.test.ts` with a case asserting a valid `dm-ai-chat-v1` value
survives `prepareImport` (accepted, not skipped) and a malformed one is skipped
(not fatal).

## Verification (Phase 6 exit)

- `pnpm --filter @workspace/dm-screen run test` green (new + existing).
- `pnpm typecheck` clean across the workspace.
- Production build clean; `grep "/api/"` and `grep bridge-protocol` in
  `dist/public/assets` both zero (unchanged — no bridge/protocol edit).
- Manual: send a turn → reload → transcript restored, no ghost "Thinking…", next
  turn starts fresh (no stale-resume error). "New chat" clears it. Export a
  backup with chat present → warning line shows and the transcript is in the
  file; with chat cleared → no warning line, key absent. Import round-trips.
