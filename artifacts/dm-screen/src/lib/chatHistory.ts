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
// most-recent messages.
export const MAX_CHAT_MESSAGES = 200;

// Byte budget for the serialized transcript, enforced alongside the count cap
// (a count cap alone is byte-unbounded: assistant messages embed full
// stat-block markdown, and a single "did you mean" can persist several
// complete cards). Sized so the stored value stays under backup.ts's
// MAX_PER_VALUE_BYTES (1 MB) — a transcript that grew past that would export
// fine but be SILENTLY SKIPPED on restore by the import path's raw-size cap —
// and so it stays a modest share of the ~5 MB origin quota this key shares
// with mid-encounter Initiative state. Whole oldest messages are dropped, not
// truncated, so a long AI answer is never cut mid-text.
export const MAX_CHAT_BYTES = 900_000;

// One bundled-data answer shown in place of a bridge reply. Moved here from
// ChatLocalAnswer.tsx (which re-exports it) so the validator can live in a
// React-free module.
export interface LocalAnswer {
  card?: ToolResultCard;
  candidates?: { name: string; card: ToolResultCard }[];
  noMatch?: string;
  hint?: string;
}

/**
 * Stable per-message identity, used as the React key (and nothing else). Index
 * keys misbehave at the MAX_CHAT_MESSAGES cap: each send then shifts every
 * index by 2, so an open per-card form (e.g. an Add-to-Party collision review)
 * would visually reattach to the wrong message. Minted at creation; the
 * validator back-fills messages persisted before ids existed. Not
 * crypto-sensitive — uniqueness within one transcript is all that matters
 * (and `crypto.randomUUID` is unavailable on non-HTTPS LAN deploys anyway).
 */
export function mintMessageId(): string {
  return `m-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export interface UserMessage {
  id: string;
  role: "user";
  text: string;
}

export interface AssistantMessage {
  id: string;
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

// Per-string clamps used when a single message alone exceeds MAX_CHAT_BYTES
// (see clampOversizedMessage). The bridge already caps each card's markdown at
// 96 K chars (toolResults.ts MAX_CARD_MARKDOWN_CHARS); these re-clamp on the
// client as defense-in-depth against an older bridge, and bound the assistant
// prose the model itself streams.
const CLAMP_CARD_MARKDOWN_CHARS = 96_000;
const CLAMP_TEXT_CHARS = 200_000;
const CLAMP_MARKER = "\n\n… (trimmed to fit saved history)";

function clampString(s: string, max: number): string {
  if (s.length <= max) return s;
  // Guard the slice end for a max below the marker length (the guaranteed-fit
  // pass uses max 0): keep nothing, just the marker, rather than a negative
  // slice that would drop the marker's tail off the end of `s` instead.
  return s.slice(0, Math.max(0, max - CLAMP_MARKER.length)) + CLAMP_MARKER;
}

/** One clamp pass at the given limits over every bulky string the message can
 *  carry: assistant prose plus card markdown, including cards nested inside a
 *  LocalAnswer's card/candidates. */
function clampPass(m: ChatMessage, textMax: number, cardMax: number): ChatMessage {
  if (m.role === "user") return { ...m, text: clampString(m.text, textMax) };
  const clampCard = (c: ToolResultCard): ToolResultCard =>
    c.markdown.length <= cardMax ? c : { ...c, markdown: clampString(c.markdown, cardMax) };
  const next: AssistantMessage = {
    ...m,
    text: clampString(m.text, textMax),
    cards: m.cards.map(clampCard),
  };
  if (m.local) {
    const local: LocalAnswer = { ...m.local };
    if (local.card) local.card = clampCard(local.card);
    if (local.candidates) {
      local.candidates = local.candidates.map((c) => ({ ...c, card: clampCard(c.card) }));
    }
    next.local = local;
  }
  return next;
}

/** If a message alone busts MAX_CHAT_BYTES, trim its bulky strings (assistant
 *  prose, card markdown — including cards inside a LocalAnswer) so the stored
 *  value stays under backup's 1 MB per-value cap, where an oversized value
 *  exports fine but is SILENTLY SKIPPED on restore. Whole-message drops can't
 *  help here — this IS the newest message, which the cap always keeps. Three
 *  passes, each re-checked against the budget: generous per-string limits first
 *  (only pathological inputs go further), then budget-divided limits sized so
 *  the message fits even at the bridge's per-turn tool-call maximum, then — for
 *  a card count so large the divided pass's 4 K floor alone busts the budget —
 *  a guaranteed-fit pass that reduces every card body to just the marker. The
 *  last pass is bounded and small for any realistic tool-call count, so a
 *  message returned from here is under budget rather than merely closer to it.
 *  Returns the same reference when nothing needs trimming. */
export function clampOversizedMessage(m: ChatMessage): ChatMessage {
  const fits = (x: ChatMessage) => JSON.stringify(x).length + 1 <= MAX_CHAT_BYTES;
  if (fits(m)) return m;
  let next = clampPass(m, CLAMP_TEXT_CHARS, CLAMP_CARD_MARKDOWN_CHARS);
  if (fits(next)) return next;
  // Still over: many capped cards on one message. Divide most of the budget
  // across the cards (floor 4 K so each stays a usable preview).
  const cardCount =
    next.role === "assistant"
      ? next.cards.length + (next.local?.card ? 1 : 0) + (next.local?.candidates?.length ?? 0)
      : 0;
  const perCard = Math.max(4_000, Math.floor(600_000 / Math.max(1, cardCount)));
  next = clampPass(next, 50_000, perCard);
  if (fits(next)) return next;
  // The 4 K floor × cardCount can itself exceed the budget (hundreds of cards
  // on one message). Reduce every card body to just the marker (structural
  // fields survive) and hard-cap the prose — the storable data is now a few
  // dozen bytes per card, well under budget for any real tool-call count.
  return clampPass(next, 20_000, 0);
}

/** Enforce MAX_CHAT_MESSAGES and MAX_CHAT_BYTES (keep-most-recent) at the
 *  mutation site, mirroring the read/import cap so a single long session can't
 *  grow the persisted transcript past the caps before the next reload trims
 *  it. The newest message is always kept — but if it ALONE exceeds the byte
 *  budget its bulky strings are trimmed (see clampOversizedMessage). Returns
 *  the same reference when already within both caps (no copy). */
export function capChatMessages(msgs: ChatMessage[]): ChatMessage[] {
  if (msgs.length > 0) {
    const last = msgs[msgs.length - 1];
    const clamped = clampOversizedMessage(last);
    if (clamped !== last) msgs = [...msgs.slice(0, -1), clamped];
  }
  const counted = msgs.length > MAX_CHAT_MESSAGES ? msgs.slice(-MAX_CHAT_MESSAGES) : msgs;
  // Walk newest → oldest, keeping messages while the running serialized size
  // fits the budget. `+ 1` per message approximates the array's comma/bracket
  // overhead in the stored JSON.
  let bytes = 0;
  let start = counted.length;
  for (let i = counted.length - 1; i >= 0; i--) {
    bytes += JSON.stringify(counted[i]).length + 1;
    if (bytes > MAX_CHAT_BYTES && start < counted.length) break;
    start = i;
    if (bytes > MAX_CHAT_BYTES) break; // oversized newest message: keep only it
  }
  return start === 0 ? counted : counted.slice(start);
}

const CARD_KINDS: readonly ToolResultCard["kind"][] = ["monster", "character", "generic", "spell"];

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** A persisted `string[]` field, filtered to the string entries (or undefined
 *  when absent/not an array), mirroring the non-string drop applied to fields. */
function cleanStringArray(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out = v.filter((x): x is string => typeof x === "string");
  return out.length ? out : undefined;
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
  // Character-only spell/weapon name lists (drive the Add-to-Party hand-off).
  // Preserve them across persistence — validateCard rebuilds the card, so an
  // uncopied field would be silently stripped on the next reload.
  const spells = cleanStringArray(parsed.spells);
  if (spells) card.spells = spells;
  const weapons = cleanStringArray(parsed.weapons);
  if (weapons) card.weapons = weapons;
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
  // Keep a persisted id (stable across reloads); mint for transcripts saved
  // before ids existed. Freshly-minted ids persist on the next write.
  const id = typeof parsed.id === "string" && parsed.id ? parsed.id : mintMessageId();
  if (parsed.role === "user") {
    if (typeof parsed.text !== "string") return undefined;
    return { id, role: "user", text: parsed.text };
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
    const msg: AssistantMessage = { id, role: "assistant", text, tools, cards, toolErrors, pending: false };
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
 *  Rejects non-arrays; caps to the most-recent MAX_CHAT_MESSAGES and
 *  MAX_CHAT_BYTES; drops malformed entries; forces every assistant message
 *  non-pending; drops a trailing content-less assistant message (a dead
 *  in-flight turn). Never throws. Returns undefined to fall back to []. */
export function validateChatHistory(parsed: unknown): ChatMessage[] | undefined {
  if (!Array.isArray(parsed)) return undefined;
  const capped = parsed.slice(-MAX_CHAT_MESSAGES);
  const out: ChatMessage[] = [];
  for (const entry of capped) {
    const m = validateMessage(entry);
    if (m) out.push(m);
  }
  if (out.length > 0 && isContentlessAssistant(out[out.length - 1])) out.pop();
  return capChatMessages(out);
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
