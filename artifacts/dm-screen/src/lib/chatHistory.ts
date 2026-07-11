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

// Window CustomEvent the widget fires whenever its in-memory transcript flips
// between empty and non-empty, so the Sidebar's "includes AI-chat transcripts"
// export warning tracks the live chat instead of a stale/debounced localStorage
// read. Mirrors the `dm-party-changed` same-tab-notification pattern (the
// native `storage` event doesn't fire for same-tab writes, and the widget's
// persist is debounced). `detail.present` is the current emptiness.
export const CHAT_CHANGED_EVENT = "dm-ai-chat-changed";

export interface ChatChangedDetail {
  present: boolean;
}

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

/** Enforce MAX_CHAT_MESSAGES (keep-most-recent) at the mutation site, mirroring
 *  the read/import cap so a single long session can't grow the persisted
 *  transcript past the cap before the next reload trims it. Returns the same
 *  reference when already within the cap (no copy). */
export function capChatMessages(msgs: ChatMessage[]): ChatMessage[] {
  return msgs.length > MAX_CHAT_MESSAGES ? msgs.slice(-MAX_CHAT_MESSAGES) : msgs;
}

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

/** True iff a non-empty persisted transcript exists. Called in render (the
 *  Sidebar export-time warning), so it must stay cheap: the value is always
 *  `JSON.stringify`'d output, so a non-empty transcript is `[` followed by a
 *  non-whitespace char before the closing `]`. Scanning the first few chars
 *  avoids `JSON.parse`-ing a potentially ~1 MB blob on every render. */
export function hasPersistedChat(): boolean {
  try {
    const raw = window.localStorage.getItem(CHAT_HISTORY_KEY);
    if (!raw) return false;
    let i = 0;
    while (i < raw.length && isWs(raw[i])) i++;
    if (raw[i] !== "[") return false;
    i++;
    while (i < raw.length && isWs(raw[i])) i++;
    return i < raw.length && raw[i] !== "]";
  } catch {
    return false;
  }
}

function isWs(ch: string): boolean {
  return ch === " " || ch === "\t" || ch === "\n" || ch === "\r";
}
