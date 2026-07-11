# Phase 6 — AI Chat history persistence — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist the AI Chat widget's transcript across reloads/tile-close in a versioned, validated `dm-ai-chat-v1` localStorage key, with backup coverage and a conditional export-time privacy warning.

**Architecture:** A new React-free `lib/chatHistory.ts` owns the chat message types (moved out of the widget) plus a `ShapeValidator` that runs on both the `useLocalStorage` read path and the `backup.ts` import path. The widget swaps its `useState` for a debounced `useLocalStorage`; the resume/session id stays session-only (transcript-only decision). `backup.ts` registers the validator; the sidebar shows a warning only when a transcript exists.

**Tech Stack:** React 19, TypeScript, Vitest (Node env, no jsdom), Tailwind v4. No new dependencies.

**Design spec:** [docs/superpowers/specs/2026-07-11-phase6-chat-history-persistence-design.md](../specs/2026-07-11-phase6-chat-history-persistence-design.md)

## Global Constraints

- **NEVER run `git commit` or `git push`.** This repo's owner commits all changes himself. Every task ends by leaving changes in the working tree for review — no commit step.
- **No bridge / `@workspace/bridge-protocol` change.** Phase 6 is entirely client-side (`artifacts/dm-screen`).
- **No new dependencies** (the `minimumReleaseAge: 1440` supply-chain gate stands; none are needed).
- **Validators run on BOTH paths.** Any key added to `backup.ts`'s `KEY_VALIDATORS` must use the same validator the widget passes to `useLocalStorage` for that key.
- **Versioned key.** The new key is `dm-ai-chat-v1`; `dm-`-prefixed so the full-backup sweep picks it up automatically.
- **Never `dangerouslySetInnerHTML`.** Rendering is unchanged; cards still render through `ChatToolCard` / `MiniMarkdown`.
- **Pure-lib test convention:** `*.test.ts` beside the code, Node env, install a fake `window.localStorage` per-test via `vi.stubGlobal` (no jsdom).

---

## File Structure

- **Create** `artifacts/dm-screen/src/lib/chatHistory.ts` — owns `CHAT_HISTORY_KEY`, `MAX_CHAT_MESSAGES`, the message types (`UserMessage`/`AssistantMessage`/`ChatMessage`) moved from the widget, `LocalAnswer` moved from `ChatLocalAnswer.tsx`, and the validators (`validateCard`, `validateLocalAnswer`, `validateChatHistory`) + `hasPersistedChat`.
- **Create** `artifacts/dm-screen/src/lib/chatHistory.test.ts` — pure unit tests.
- **Modify** `artifacts/dm-screen/src/components/widgets/ChatLocalAnswer.tsx` — import `LocalAnswer` from `chatHistory.ts` and re-export it (keeps existing importers working).
- **Modify** `artifacts/dm-screen/src/components/widgets/AIChatWidget.tsx` — drop the local message types, import them from `chatHistory.ts`, swap `useState` → `useLocalStorage`.
- **Modify** `artifacts/dm-screen/src/lib/backup.ts` — register `dm-ai-chat-v1`.
- **Modify** `artifacts/dm-screen/src/lib/backup.test.ts` — add round-trip cases.
- **Modify** `artifacts/dm-screen/src/components/Sidebar.tsx` — conditional export-time warning.

---

## Task 1: Pure `chatHistory.ts` module (types + validators + helper) with tests

**Files:**
- Create: `artifacts/dm-screen/src/lib/chatHistory.ts`
- Create: `artifacts/dm-screen/src/lib/chatHistory.test.ts`
- Modify: `artifacts/dm-screen/src/components/widgets/ChatLocalAnswer.tsx:6-11` (the `LocalAnswer` interface + its imports)

**Interfaces:**
- Consumes: `ToolResultCard` from `@/lib/cardHandoff` (type-only).
- Produces:
  - `CHAT_HISTORY_KEY: "dm-ai-chat-v1"`, `MAX_CHAT_MESSAGES: 200`
  - `interface UserMessage { role: "user"; text: string }`
  - `interface AssistantMessage { role: "assistant"; text: string; tools: string[]; cards: ToolResultCard[]; toolErrors: { tool: string; message: string }[]; error?: string; pending: boolean; local?: LocalAnswer; sourceQuery?: string; escalated?: boolean }`
  - `type ChatMessage = UserMessage | AssistantMessage`
  - `interface LocalAnswer { card?: ToolResultCard; candidates?: { name: string; card: ToolResultCard }[]; noMatch?: string; hint?: string }`
  - `validateCard(parsed: unknown): ToolResultCard | undefined`
  - `validateLocalAnswer(parsed: unknown): LocalAnswer | undefined`
  - `validateChatHistory(parsed: unknown): ChatMessage[] | undefined`
  - `hasPersistedChat(): boolean`

- [ ] **Step 1: Write the module**

Create `artifacts/dm-screen/src/lib/chatHistory.ts`:

```ts
// Chat-history persistence for the AI Chat widget.
//
// Pure module (no React) so the same validator runs on BOTH the
// `useLocalStorage` read path in AIChatWidget and the backup-import path in
// backup.ts — matching the cardHandoff.ts / localLookup.ts convention. Owns
// the chat message types (moved out of AIChatWidget.tsx) and the LocalAnswer
// type (moved out of ChatLocalAnswer.tsx) so backup.ts never has to import a
// widget `.tsx` (which would pull React into its Node-test import graph).

import type { ToolResultCard } from "@/lib/cardHandoff";

export const CHAT_HISTORY_KEY = "dm-ai-chat-v1";

// Count-based cap like MAX_COMBATANTS / MAX_PARTY. On overflow keep the
// most-recent messages. No per-message text cap — the count cap plus the
// import path's MAX_RAW_VALUE_BYTES (2 MB) backstop bound the stored size,
// and a per-message cap would risk truncating a long AI answer.
export const MAX_CHAT_MESSAGES = 200;

// One bundled-data answer shown in place of a bridge reply. Moved here from
// ChatLocalAnswer.tsx (which re-exports it) so the validator can live in a
// React-free module.
export interface LocalAnswer {
  card?: ToolResultCard;
  candidates?: { name: string; card: ToolResultCard }[];
  noMatch?: string;
  hint?: string;
}

export interface UserMessage {
  role: "user";
  text: string;
}

export interface AssistantMessage {
  role: "assistant";
  text: string;
  tools: string[];
  cards: ToolResultCard[];
  toolErrors: { tool: string; message: string }[];
  error?: string;
  pending: boolean;
  local?: LocalAnswer;
  sourceQuery?: string;
  escalated?: boolean;
}

export type ChatMessage = UserMessage | AssistantMessage;

const CARD_KINDS: readonly ToolResultCard["kind"][] = ["monster", "character", "generic"];

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Validate one persisted preview card. Returns a clean ToolResultCard or
 *  undefined (caller drops it). Unknown `kind` degrades to "generic",
 *  matching the bridge's isBridgeEvent. Non-string field values are dropped. */
export function validateCard(parsed: unknown): ToolResultCard | undefined {
  if (!isRecord(parsed)) return undefined;
  if (parsed.type !== "tool_result") return undefined;
  if (typeof parsed.tool !== "string") return undefined;
  if (typeof parsed.title !== "string") return undefined;
  if (typeof parsed.markdown !== "string") return undefined;
  const kind = CARD_KINDS.includes(parsed.kind as ToolResultCard["kind"])
    ? (parsed.kind as ToolResultCard["kind"])
    : "generic";
  const card: ToolResultCard = {
    type: "tool_result",
    tool: parsed.tool,
    kind,
    title: parsed.title,
    markdown: parsed.markdown,
  };
  if (isRecord(parsed.fields)) {
    const fields: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed.fields)) {
      if (typeof v === "string") fields[k] = v;
    }
    card.fields = fields;
  }
  return card;
}

/** Validate a persisted LocalAnswer. Drops individual malformed cards /
 *  candidates; returns undefined only if nothing valid remains. */
export function validateLocalAnswer(parsed: unknown): LocalAnswer | undefined {
  if (!isRecord(parsed)) return undefined;
  const out: LocalAnswer = {};
  if (parsed.card !== undefined) {
    const c = validateCard(parsed.card);
    if (c) out.card = c;
  }
  if (Array.isArray(parsed.candidates)) {
    const cands: { name: string; card: ToolResultCard }[] = [];
    for (const raw of parsed.candidates) {
      if (!isRecord(raw) || typeof raw.name !== "string") continue;
      const c = validateCard(raw.card);
      if (c) cands.push({ name: raw.name, card: c });
    }
    if (cands.length > 0) out.candidates = cands;
  }
  if (typeof parsed.noMatch === "string") out.noMatch = parsed.noMatch;
  if (typeof parsed.hint === "string") out.hint = parsed.hint;
  return Object.keys(out).length > 0 ? out : undefined;
}

function validateMessage(parsed: unknown): ChatMessage | undefined {
  if (!isRecord(parsed)) return undefined;
  if (parsed.role === "user") {
    if (typeof parsed.text !== "string") return undefined;
    return { role: "user", text: parsed.text };
  }
  if (parsed.role === "assistant") {
    const text = typeof parsed.text === "string" ? parsed.text : "";
    const tools = Array.isArray(parsed.tools)
      ? parsed.tools.filter((t): t is string => typeof t === "string")
      : [];
    const cards = Array.isArray(parsed.cards)
      ? parsed.cards.map(validateCard).filter((c): c is ToolResultCard => c !== undefined)
      : [];
    const toolErrors = Array.isArray(parsed.toolErrors)
      ? parsed.toolErrors.filter(
          (e): e is { tool: string; message: string } =>
            isRecord(e) && typeof e.tool === "string" && typeof e.message === "string",
        )
      : [];
    // Never restore an in-flight turn as pending — nothing is streaming on load.
    const msg: AssistantMessage = { role: "assistant", text, tools, cards, toolErrors, pending: false };
    if (typeof parsed.error === "string") msg.error = parsed.error;
    const local = validateLocalAnswer(parsed.local);
    if (local) msg.local = local;
    if (typeof parsed.sourceQuery === "string") msg.sourceQuery = parsed.sourceQuery;
    if (typeof parsed.escalated === "boolean") msg.escalated = parsed.escalated;
    return msg;
  }
  return undefined;
}

function isContentlessAssistant(m: ChatMessage): boolean {
  return (
    m.role === "assistant" &&
    m.text === "" &&
    m.cards.length === 0 &&
    m.toolErrors.length === 0 &&
    !m.local &&
    !m.error
  );
}

/** ShapeValidator<ChatMessage[]> for useLocalStorage + backup import.
 *  Rejects non-arrays; caps to the most-recent MAX_CHAT_MESSAGES; drops
 *  malformed entries; forces every assistant message non-pending; drops a
 *  trailing content-less assistant message (a dead in-flight turn). Never
 *  throws. Returns undefined to fall back to []. */
export function validateChatHistory(parsed: unknown): ChatMessage[] | undefined {
  if (!Array.isArray(parsed)) return undefined;
  const capped = parsed.slice(-MAX_CHAT_MESSAGES);
  const out: ChatMessage[] = [];
  for (const entry of capped) {
    const m = validateMessage(entry);
    if (m) out.push(m);
  }
  if (out.length > 0 && isContentlessAssistant(out[out.length - 1])) out.pop();
  return out;
}

/** True iff a non-empty persisted transcript exists. Cheap enough to call in
 *  render (Sidebar's export-time warning). */
export function hasPersistedChat(): boolean {
  try {
    const raw = window.localStorage.getItem(CHAT_HISTORY_KEY);
    if (!raw) return false;
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0;
  } catch {
    return false;
  }
}
```

- [ ] **Step 2: Write the failing test**

Create `artifacts/dm-screen/src/lib/chatHistory.test.ts`:

```ts
import { afterEach, describe, it, expect, vi } from "vitest";
import {
  CHAT_HISTORY_KEY,
  MAX_CHAT_MESSAGES,
  validateCard,
  validateChatHistory,
  hasPersistedChat,
  type ChatMessage,
} from "./chatHistory";

function goodCard(over: Record<string, unknown> = {}) {
  return { type: "tool_result", tool: "ddb_get_monster", kind: "monster", title: "Goblin", markdown: "# Goblin", ...over };
}

describe("validateCard", () => {
  it("accepts a well-formed card and keeps string fields", () => {
    const c = validateCard(goodCard({ fields: { ac: "15", hp: "7", bogus: 3 } }));
    expect(c).toEqual({ type: "tool_result", tool: "ddb_get_monster", kind: "monster", title: "Goblin", markdown: "# Goblin", fields: { ac: "15", hp: "7" } });
  });
  it("coerces an unknown kind to generic", () => {
    expect(validateCard(goodCard({ kind: "spaceship" }))?.kind).toBe("generic");
  });
  it("rejects a card missing markdown/title/tool", () => {
    expect(validateCard(goodCard({ markdown: 3 }))).toBeUndefined();
    expect(validateCard({ type: "tool_result" })).toBeUndefined();
    expect(validateCard(null)).toBeUndefined();
  });
});

describe("validateChatHistory", () => {
  it("round-trips a valid mixed transcript, forcing pending false", () => {
    const input = [
      { role: "user", text: "hi" },
      { role: "assistant", text: "hello", tools: ["Monster"], cards: [goodCard()], toolErrors: [], pending: true, sourceQuery: "goblin", escalated: false },
    ];
    const out = validateChatHistory(input)!;
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({ role: "user", text: "hi" });
    const a = out[1] as Extract<ChatMessage, { role: "assistant" }>;
    expect(a.pending).toBe(false);
    expect(a.cards).toHaveLength(1);
    expect(a.sourceQuery).toBe("goblin");
  });

  it("caps to the most-recent MAX_CHAT_MESSAGES", () => {
    const many = Array.from({ length: MAX_CHAT_MESSAGES + 5 }, (_, i) => ({ role: "user", text: `m${i}` }));
    const out = validateChatHistory(many)!;
    expect(out).toHaveLength(MAX_CHAT_MESSAGES);
    expect((out[0] as { text: string }).text).toBe("m5"); // oldest 5 dropped
  });

  it("drops a malformed card but keeps the message", () => {
    const out = validateChatHistory([
      { role: "assistant", text: "x", tools: [], cards: [goodCard(), { type: "tool_result", markdown: 3 }], toolErrors: [], pending: false },
    ])!;
    expect((out[0] as { cards: unknown[] }).cards).toHaveLength(1);
  });

  it("drops an unknown-role entry", () => {
    const out = validateChatHistory([{ role: "system", text: "nope" }, { role: "user", text: "ok" }])!;
    expect(out).toHaveLength(1);
    expect((out[0] as { text: string }).text).toBe("ok");
  });

  it("drops a trailing content-less assistant message", () => {
    const out = validateChatHistory([
      { role: "user", text: "hi" },
      { role: "assistant", text: "", tools: [], cards: [], toolErrors: [], pending: true },
    ])!;
    expect(out).toHaveLength(1);
    expect(out[0].role).toBe("user");
  });

  it("returns undefined for a non-array", () => {
    expect(validateChatHistory({})).toBeUndefined();
    expect(validateChatHistory("[]")).toBeUndefined();
    expect(validateChatHistory(null)).toBeUndefined();
  });
});

describe("hasPersistedChat", () => {
  afterEach(() => vi.unstubAllGlobals());
  function stub(raw: string | null) {
    vi.stubGlobal("window", { localStorage: { getItem: (k: string) => (k === CHAT_HISTORY_KEY ? raw : null) } });
  }
  it("is false for missing/empty/[]", () => {
    stub(null); expect(hasPersistedChat()).toBe(false);
    stub("[]"); expect(hasPersistedChat()).toBe(false);
    stub("not json"); expect(hasPersistedChat()).toBe(false);
  });
  it("is true for a non-empty array", () => {
    stub(JSON.stringify([{ role: "user", text: "hi" }]));
    expect(hasPersistedChat()).toBe(true);
  });
});
```

- [ ] **Step 3: Run the new tests — expect PASS**

Run: `pnpm --filter @workspace/dm-screen exec vitest run src/lib/chatHistory.test.ts`
Expected: all tests PASS. (The module in Step 1 already satisfies them; this is TDD-by-construction for a pure validator — if any fail, fix `chatHistory.ts`, not the test.)

- [ ] **Step 4: Move `LocalAnswer` out of `ChatLocalAnswer.tsx`**

In `artifacts/dm-screen/src/components/widgets/ChatLocalAnswer.tsx`, replace the local import + interface (currently around lines 4–11):

```ts
import type { ToolResultCard } from "@/lib/cardHandoff";

export interface LocalAnswer {
  card?: ToolResultCard;
  candidates?: { name: string; card: ToolResultCard }[];
  noMatch?: string;
  hint?: string;
}
```

with a re-export from the new module (drop the now-unused `ToolResultCard` import if nothing else in the file uses it — `ChatToolCard` is still imported separately):

```ts
import type { LocalAnswer } from "@/lib/chatHistory";
export type { LocalAnswer };
```

Leave the rest of `ChatLocalAnswer.tsx` unchanged — it still references `LocalAnswer` in its props, now resolved from the re-export.

- [ ] **Step 5: Typecheck + full dm-screen suite**

Run: `pnpm --filter @workspace/dm-screen run typecheck`
Expected: no errors.
Run: `pnpm --filter @workspace/dm-screen run test`
Expected: all tests PASS (existing suite + the new `chatHistory.test.ts`). `AIChatWidget.tsx` still compiles — it imports `LocalAnswer` from `./ChatLocalAnswer`, which now re-exports it.

- [ ] **Step 6: Leave changes in the working tree for review**

Do **not** commit (see Global Constraints). Report the new files and the `ChatLocalAnswer.tsx` edit for review.

---

## Task 2: Persist the transcript in `AIChatWidget.tsx`

**Files:**
- Modify: `artifacts/dm-screen/src/components/widgets/AIChatWidget.tsx` (imports ~1–15, the message-type block ~94–110, the `messages` state ~117)

**Interfaces:**
- Consumes: `CHAT_HISTORY_KEY`, `validateChatHistory`, `ChatMessage`, `AssistantMessage`, `LocalAnswer` from `@/lib/chatHistory`; `useLocalStorage` from `@/hooks/useLocalStorage`.
- Produces: no new exports — behavior change only (transcript persists).

- [ ] **Step 1: Import the hook and the moved types**

At the top of `AIChatWidget.tsx`, add the hook import and the chatHistory import. Add:

```ts
import { useLocalStorage } from "@/hooks/useLocalStorage";
import {
  CHAT_HISTORY_KEY,
  validateChatHistory,
  type ChatMessage,
  type AssistantMessage,
} from "@/lib/chatHistory";
```

Change the existing `ChatLocalAnswer` import (line 15) to drop the now-unneeded `LocalAnswer` (the widget references it only inside `AssistantMessage`, which now lives in `chatHistory.ts`):

```ts
import { ChatLocalAnswer } from "./ChatLocalAnswer";
```

If `ToolResultCard` is imported from `./ChatToolCard` (line 11) purely for the local `AssistantMessage` type, change that import to value-only and drop the type:

```ts
import { ChatToolCard } from "./ChatToolCard";
```

- [ ] **Step 2: Delete the local message-type block**

Remove the local definitions (currently lines ~94–110):

```ts
interface AssistantMessage { ... }
interface UserMessage { ... }
type ChatMessage = UserMessage | AssistantMessage;
```

They now come from `@/lib/chatHistory` (imported in Step 1). `UserMessage` is only referenced via the `ChatMessage` union, so it need not be imported by name.

- [ ] **Step 3: Swap `useState` → `useLocalStorage`**

Replace (line ~117):

```ts
const [messages, setMessages] = useState<ChatMessage[]>([]);
```

with:

```ts
// Persisted transcript. The hook debounces writes (streaming mutates
// `messages` per token) and flushes on pagehide / tab-hidden / unmount / before
// a backup sweep. `validateChatHistory` forces every restored assistant message
// non-pending, so a reload shows history with no ghost "Thinking…". The bridge
// resume/session id is intentionally NOT persisted (`sessionIdRef` starts null),
// so the first post-reload turn begins a fresh session.
const [messages, setMessages] = useLocalStorage<ChatMessage[]>(
  CHAT_HISTORY_KEY,
  [],
  validateChatHistory,
  { debounceWriteMs: 500 },
);
```

Leave `messagesRef`, `streamTurn`, `escalate`, `updateAssistantAt`, `newChat`, and the send/abort guards unchanged — they operate on `messages` / `setMessages`. `newChat`'s `setMessages([])` now also clears the persisted key.

Remove `useState` from the `react` import if it is no longer used anywhere else in the file; keep it if other state (`status`, `health`, `input`, `sending`, `model`, `effort`) still uses it — it does, so `useState` stays.

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @workspace/dm-screen run typecheck`
Expected: no errors. (`useLocalStorage<ChatMessage[]>`'s validator param matches `validateChatHistory`'s `(unknown) => ChatMessage[] | undefined` signature.)

- [ ] **Step 5: Production build + bundle scan**

Run: `pnpm build`
Expected: build succeeds.
Run: `grep -r "/api/" artifacts/dm-screen/dist/public/assets/ ; grep -r "bridge-protocol" artifacts/dm-screen/dist/public/assets/`
Expected: both return nothing (exit 1) — no bridge/protocol code leaked into the bundle (unchanged from before).

- [ ] **Step 6: Manual verification (bridge running)**

Start the app (`pnpm dev`), open the AI Chat tile, send a turn (e.g. `/monster goblin`, then a free-text question). Reload the page. Expected: the transcript is restored, no spinning "Thinking…", and the next turn works (no stale-resume error). Click "New chat" → transcript clears and stays cleared after another reload. Verify in DevTools that `localStorage["dm-ai-chat-v1"]` holds the messages array and is `[]`/absent after New chat.

- [ ] **Step 7: Leave changes in the working tree for review** (no commit).

---

## Task 3: Register `dm-ai-chat-v1` in the backup validator registry

**Files:**
- Modify: `artifacts/dm-screen/src/lib/backup.ts` (import block ~20–28, `KEY_VALIDATORS` ~355–411)
- Modify: `artifacts/dm-screen/src/lib/backup.test.ts` (add a `describe` block)

**Interfaces:**
- Consumes: `validateChatHistory` from `@/lib/chatHistory`.
- Produces: `dm-ai-chat-v1` is now an import-validated key (accepted when well-formed, skipped when malformed, never fatal).

- [ ] **Step 1: Write the failing test**

In `artifacts/dm-screen/src/lib/backup.test.ts`, add near the other import-flow blocks:

```ts
import { validateChatHistory } from "./chatHistory";

describe("dm-ai-chat-v1 backup round-trip", () => {
  beforeEach(() => installStorage());

  it("accepts a valid transcript and skips a malformed one", () => {
    const good = JSON.stringify([
      { role: "user", text: "hi" },
      { role: "assistant", text: "hey", tools: [], cards: [], toolErrors: [], pending: false },
    ]);
    const okPrep = prepareImport(envelope({ "dm-ai-chat-v1": good }));
    expect(okPrep.summary.accepted).toBe(1);
    expect(okPrep.summary.skipped).not.toContain("dm-ai-chat-v1");
    okPrep.commit();
    // pending is normalized to false by the shared validator on import.
    expect(JSON.parse(window.localStorage.getItem("dm-ai-chat-v1")!)).toEqual(
      validateChatHistory(JSON.parse(good)),
    );

    const badPrep = prepareImport(envelope({ "dm-ai-chat-v1": JSON.stringify({ not: "an array" }) }));
    expect(badPrep.summary.skipped).toContain("dm-ai-chat-v1");
  });
});
```

- [ ] **Step 2: Run the new test — expect FAIL**

Run: `pnpm --filter @workspace/dm-screen exec vitest run src/lib/backup.test.ts -t "dm-ai-chat-v1"`
Expected: FAIL — the key currently falls through to `unknownKeyValidator`, which accepts the malformed object (it only checks byte size), so `skipped` won't contain `dm-ai-chat-v1`.

- [ ] **Step 3: Register the validator**

In `artifacts/dm-screen/src/lib/backup.ts`, add the import near the other lib-validator imports (after the `combatant` import block, ~line 26):

```ts
import { validateChatHistory } from "@/lib/chatHistory";
```

Then add to the `KEY_VALIDATORS` record (place it near the party/initiative group, since it is likewise DDB-content-bearing):

```ts
  // AI Chat transcript — persisted history (Phase 6). Shared validator caps
  // to MAX_CHAT_MESSAGES and normalizes each message; also used by the
  // widget's useLocalStorage read path.
  "dm-ai-chat-v1": lift(validateChatHistory),
```

- [ ] **Step 4: Run the test — expect PASS**

Run: `pnpm --filter @workspace/dm-screen exec vitest run src/lib/backup.test.ts -t "dm-ai-chat-v1"`
Expected: PASS.

- [ ] **Step 5: Full suite + typecheck**

Run: `pnpm --filter @workspace/dm-screen run test`
Expected: all PASS.
Run: `pnpm --filter @workspace/dm-screen run typecheck`
Expected: no errors.

- [ ] **Step 6: Leave changes in the working tree for review** (no commit).

---

## Task 4: Conditional export-time warning in the sidebar

**Files:**
- Modify: `artifacts/dm-screen/src/components/Sidebar.tsx` (import block ~1–9, BACKUP panel ~272–274)

**Interfaces:**
- Consumes: `hasPersistedChat` from `@/lib/chatHistory`.
- Produces: no new exports — a conditional UI line.

- [ ] **Step 1: Import the helper**

In `artifacts/dm-screen/src/components/Sidebar.tsx`, add:

```ts
import { hasPersistedChat } from "@/lib/chatHistory";
```

- [ ] **Step 2: Render the warning only when a transcript exists**

In the BACKUP panel, directly after the existing description paragraph (the `<p>` ending "…move it to another browser or back up.", ~line 274), add:

```tsx
{hasPersistedChat() && (
  <p className="text-[10px] leading-relaxed mb-2 text-amber-300/80">
    ⚠ Includes AI-chat transcripts (may contain D&amp;D Beyond content).
  </p>
)}
```

`hasPersistedChat()` is a cheap synchronous localStorage read; the sidebar already re-renders on open/interaction, so the line appears/disappears in step with the transcript.

- [ ] **Step 3: Typecheck + build**

Run: `pnpm --filter @workspace/dm-screen run typecheck`
Expected: no errors.
Run: `pnpm build`
Expected: build succeeds.

- [ ] **Step 4: Manual verification**

With a chat transcript present, open the sidebar BACKUP panel → the amber warning line shows. Click "New chat" in the AI Chat tile, reopen the panel → the line is gone. Export a backup while a transcript exists → the JSON contains `dm-ai-chat-v1`; export after New chat → it does not.

- [ ] **Step 5: Leave changes in the working tree for review** (no commit).

---

## Final verification (Phase 6 exit)

- [ ] `pnpm --filter @workspace/dm-screen run test` — all green (new + existing).
- [ ] `pnpm typecheck` — clean across the workspace.
- [ ] `pnpm build` — succeeds; `grep -r "/api/" artifacts/dm-screen/dist/public/assets/` and `grep -r "bridge-protocol" artifacts/dm-screen/dist/public/assets/` both return nothing.
- [ ] Manual: send → reload → transcript restored, no ghost "Thinking…", next turn fresh; "New chat" clears the key; backup export shows the warning + includes the key when a transcript exists, omits both when cleared; import round-trips.
- [ ] Update `HANDOVER-ai-chat-widget.md`: mark Phase 6 ✅ with a Progress-log entry summarizing the decisions (persist · both-mitigations · transcript-only) and the files touched.
