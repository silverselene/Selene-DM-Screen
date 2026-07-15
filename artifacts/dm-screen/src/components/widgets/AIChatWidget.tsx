import { useEffect, useRef, useState, useCallback } from "react";
import { Sparkles, Send, Loader2, Search, AlertTriangle, RefreshCw, Square, SquarePen, ChevronDown } from "lucide-react";
import {
  checkHealth,
  streamChat,
  stallTimeoutForTurn,
  friendlyToolName,
  BridgeOriginError,
  BridgeUnreachableError,
  type BridgeHealth,
  type EffortLevel,
} from "@/lib/aiBridge";
import { ChatToolCard } from "./ChatToolCard";
import { MiniMarkdown } from "@/lib/miniMarkdown";
import { AnchoredDropdown } from "@/lib/AnchoredDropdown";
import { parseLookupCommand, lookupDataset, autoDetectLocal } from "@/lib/localLookup";
import { ChatLocalAnswer, type LocalAnswer } from "./ChatLocalAnswer";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { isImeComposing } from "@/lib/keyboard";
import {
  CHAT_HISTORY_KEY,
  CHAT_CHANGED_EVENT,
  capChatMessages,
  mintMessageId,
  validateChatHistory,
  type ChatMessage,
  type AssistantMessage,
  type ChatChangedDetail,
} from "@/lib/chatHistory";

// Model catalog for the footer picker — the single source of truth for the menu
// (the bridge forwards the chosen id opaquely). Session-only selection; defaults
// to Sonnet 5 + Medium effort.
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
const DEFAULT_MODEL = "claude-sonnet-5";
const DEFAULT_EFFORT: EffortLevel = "medium";

// /health's `billing` is a wire enum (see AuthMode in services/ai-bridge) —
// map it to a human label for the footer instead of leaking the raw camelCase
// mode string. An unknown future mode falls through verbatim.
const BILLING_LABELS: Record<string, string> = {
  subscription: "Subscription",
  apiKey: "API key (metered)",
};

/**
 * A compact footer dropdown (model or effort). Portals via AnchoredDropdown so
 * the menu escapes the tile's `overflow: hidden`. Selection is applied to the
 * next turn only — picking a value never aborts or resets the conversation.
 */
function FooterPicker<T extends string>({
  value,
  options,
  onChange,
  title,
}: {
  value: T;
  options: readonly { id: T; label: string }[];
  onChange: (v: T) => void;
  title: string;
}) {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);
  const current = options.find((o) => o.id === value);
  return (
    <>
      <button
        ref={setAnchor}
        type="button"
        title={title}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-0.5 hover:text-amber-300/90 transition-colors"
      >
        {current?.label ?? value}
        <ChevronDown className="w-2.5 h-2.5 opacity-70" />
      </button>
      <AnchoredDropdown anchor={anchor} open={open} role="listbox" autoWidth onRequestClose={() => setOpen(false)}>
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            role="option"
            aria-selected={o.id === value}
            // Commit on click (which Enter/Space also fire — keyboard operable),
            // not mousedown; preventDefault on mousedown only stops the press
            // from stealing focus before the click lands.
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              onChange(o.id);
              setOpen(false);
            }}
            className={`block w-full text-left px-2 py-1 text-[11px] whitespace-nowrap hover:bg-amber-900/30 transition-colors ${
              o.id === value ? "text-amber-300" : "text-gray-200"
            }`}
          >
            {o.label}
          </button>
        ))}
      </AnchoredDropdown>
    </>
  );
}

// Talks to the optional local AI bridge and streams the assistant reply. When
// the bridge is unreachable the chat view STAYS mounted and a banner explains
// why: the bundled-data lookups (/spell, /monster, /rule) need no bridge, so
// the transcript and composer must remain usable. Only the initial reachability
// probe replaces the view, via the "checking" screen. The transcript persists
// to localStorage (CHAT_HISTORY_KEY) through useLocalStorage.

// Message types (ChatMessage / AssistantMessage / UserMessage) live in the
// React-free @/lib/chatHistory module so the persistence validator can share
// them; imported above.

// "blocked" = the bridge is running but 403'd this page's origin (its CORS
// allowlist doesn't include wherever the SPA is being served from) — the
// remedy is the AI_BRIDGE_ALLOWED_ORIGINS env var, not starting the bridge,
// so it must not collapse into "offline".
type BridgeStatus = "checking" | "online" | "offline" | "blocked";
// The statuses /health can settle on — i.e. BridgeStatus minus the transient
// "checking". Named so refreshHealth can hand one back to a caller that needs
// to tell "bridge down" from "origin refused".
type SettledStatus = Exclude<BridgeStatus, "checking">;

// Shown on a message when a bridge-bound question fails. These render in an
// error bubble as raw text, NOT through MiniMarkdown — so no markdown syntax
// (backticks around `pnpm dev:ai` would reach the DM as literal backticks).
const BRIDGE_DOWN_MESSAGE =
  "The AI bridge isn't running, so Selene can't answer that. Start it with pnpm dev:ai, or look things up from your bundled data with /spell, /monster, or /rule.";
const BRIDGE_BLOCKED_MESSAGE =
  "The AI bridge is running but refused this page's origin, so Selene can't answer that. See the banner above for the fix, or look things up from your bundled data with /spell, /monster, or /rule.";

/**
 * The bridge-unreachable notice. This is a banner *above* the chat view, not a
 * replacement for it: the bundled-data lookups (/spell, /monster, /rule) need no
 * bridge, so the composer and transcript must stay reachable while it shows —
 * including while a retry is in flight, which is why `onRetry` re-probes in
 * place (via refreshHealth) rather than flipping the widget to "checking".
 * Tracks the retry locally so the button can show progress without the caller
 * having to thread a `retrying` flag down.
 */
function BridgeDownBanner({
  status,
  onRetry,
}: {
  status: "offline" | "blocked";
  onRetry: () => Promise<void>;
}) {
  const [retrying, setRetrying] = useState(false);
  return (
    <div className="shrink-0 mb-2 flex items-start gap-2 rounded border border-amber-700/50 bg-amber-950/30 px-2 py-1.5">
      <AlertTriangle className="w-3.5 h-3.5 mt-px shrink-0 text-amber-500/80" />
      <div className="flex-1 min-w-0 text-[10px] leading-relaxed text-amber-300/90">
        {status === "offline" ? (
          <>
            <span className="font-semibold">AI bridge not running.</span> Lookups from your bundled
            data still work. For Selene, start it with{" "}
            <code className="px-1 py-0.5 rounded bg-black/30">pnpm dev:ai</code> (or{" "}
            <code className="px-1 py-0.5 rounded bg-black/30">pnpm dev</code>), then retry.
          </>
        ) : (
          <>
            <span className="font-semibold">AI bridge refused this page.</span> Lookups from your
            bundled data still work. To reach Selene, restart the bridge with{" "}
            <code className="px-1 py-0.5 rounded bg-black/30 break-all">
              AI_BRIDGE_ALLOWED_ORIGINS={window.location.origin}
            </code>
            , then retry.
          </>
        )}
      </div>
      <button
        onClick={() => {
          if (retrying) return;
          setRetrying(true);
          // A successful retry unmounts this banner, so the settled state is
          // whatever `status` becomes — nothing to clean up but the flag.
          void onRetry().finally(() => setRetrying(false));
        }}
        disabled={retrying}
        className="shrink-0 flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border border-amber-700/50 text-amber-300/90 hover:bg-amber-900/20 disabled:opacity-50 transition-colors"
      >
        <RefreshCw className={`w-2.5 h-2.5 ${retrying ? "animate-spin" : ""}`} />{" "}
        {retrying ? "Retrying…" : "Retry"}
      </button>
    </div>
  );
}

export function AIChatWidget() {
  const [status, setStatus] = useState<BridgeStatus>("checking");
  const [health, setHealth] = useState<BridgeHealth | null>(null);
  // Persisted transcript. The hook debounces writes (streaming mutates
  // `messages` per token) and flushes on pagehide / tab-hidden / unmount /
  // before a backup sweep. `validateChatHistory` forces every restored
  // assistant message non-pending, so a reload shows history with no ghost
  // "Thinking…". The bridge resume/session id is intentionally NOT persisted
  // (`sessionIdRef` starts null), so the first post-reload turn starts fresh.
  // Flips on when a transcript write throws (quota exceeded / private mode) so
  // the DM sees "history isn't being saved" instead of a console-only failure.
  // Cleared by "New chat" — emptying the transcript is the in-app remedy.
  const [persistFailed, setPersistFailed] = useState(false);
  const [messages, setMessages] = useLocalStorage<ChatMessage[]>(
    CHAT_HISTORY_KEY,
    [],
    validateChatHistory,
    {
      debounceWriteMs: 500,
      onWriteError: () => setPersistFailed(true),
      // Clear the warning if storage recovers (DM frees space elsewhere) so the
      // banner doesn't stay stuck until a manual New chat.
      onWriteSuccess: () => setPersistFailed(false),
    },
  );
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  // Session-only model/effort selection. Applied to the next turn's request;
  // changing either mid-conversation does not reset the chat or abort a turn.
  const [model, setModel] = useState<string>(DEFAULT_MODEL);
  const [effort, setEffort] = useState<EffortLevel>(DEFAULT_EFFORT);

  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  // The bridge's Agent-SDK session for this conversation. Captured from each
  // turn's `done` event and echoed back on the next turn so follow-up questions
  // keep context. Resets when the widget remounts (tile closed/reopened).
  const sessionIdRef = useRef<string | null>(null);
  // Mirror of `messages`, kept current on every render, so an event handler can
  // read the authoritative length synchronously to compute the index of a
  // message it is about to append — without relying on a setState updater's
  // side-effect running before the next line (it does not, because the preceding
  // setInput marks the fiber dirty and defeats React's eager-state shortcut).
  const messagesRef = useRef<ChatMessage[]>(messages);
  messagesRef.current = messages;
  // Mirror of `health`, kept current on every render, so streamTurn can size the
  // stall watchdog from the bridge's reported turn cap without re-creating the
  // callback (and the send/escalate callbacks that depend on it) on every probe.
  const healthRef = useRef<BridgeHealth | null>(health);
  healthRef.current = health;
  // Mirror of `status`, so a stream event can clear a stale "bridge down" banner
  // (the DM started the bridge but never hit Retry) without the callback
  // depending on `status` and re-creating on every probe.
  const statusRef = useRef<BridgeStatus>(status);
  statusRef.current = status;
  // Synchronous in-flight guard. `sending` state lags a render behind, so a fast
  // double Enter/click could fire two turns before it flips; this ref is set the
  // instant a bridge turn begins and read by the send/escalate guards.
  const sendingRef = useRef(false);

  // Re-read /health and settle the status, WITHOUT flipping through "checking".
  // The "checking" state replaces the whole view, so any refresh that happens
  // with a transcript on screen must not route through it or the transcript
  // would vanish under the DM. Returns the settled status so a caller can word
  // its message from it (see the BridgeUnreachableError catch in streamTurn).
  const refreshHealth = useCallback(async (): Promise<SettledStatus> => {
    try {
      const h = await checkHealth();
      setHealth(h);
      setStatus("online");
      return "online";
    } catch (err) {
      const settled: SettledStatus = err instanceof BridgeOriginError ? "blocked" : "offline";
      setHealth(null);
      setStatus(settled);
      return settled;
    }
  }, []);

  // Re-read /health for the footer's billing line ONLY — never touches `status`.
  // For use when something else has already proven the bridge reachable (a
  // streamed event): checkHealth has a short timeout, so a probe that loses a
  // race with a busy bridge must not be allowed to contradict that proof.
  const refreshBilling = useCallback(() => {
    void checkHealth()
      .then(setHealth)
      .catch(() => {});
  }, []);

  // Full probe, including the "checking" screen. Only for mount, where there is
  // no transcript on screen to protect.
  const probe = useCallback(async () => {
    setStatus("checking");
    await refreshHealth();
  }, [refreshHealth]);

  useEffect(() => {
    void probe();
  }, [probe]);

  // Auto-scroll to the newest content as the reply streams in — but only while
  // the DM is already pinned to the bottom. Scrolling up to re-read a stat
  // block mid-stream must not be yanked back down on every token (nor when an
  // escalation mutates an older message). Sending a new message re-pins.
  const pinnedRef = useRef(true);
  const onTranscriptScroll = () => {
    const el = scrollRef.current;
    if (el) pinnedRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 32;
  };
  useEffect(() => {
    const el = scrollRef.current;
    if (el && pinnedRef.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  // Abort any in-flight turn if the widget unmounts (tile closed / type switched).
  useEffect(() => () => abortRef.current?.abort(), []);

  // Keep the Sidebar's backup warning in sync with the live transcript. The
  // warning must reflect what a backup would export, but the persist is
  // debounced and the native `storage` event doesn't fire for same-tab writes,
  // so a direct localStorage read there can lag. Emit a same-tab CustomEvent
  // when the transcript flips between empty and non-empty (depending on the
  // boolean, not `messages`, so this fires on the flip — not per streamed
  // token). We intentionally do NOT emit `false` on unmount: closing the tile
  // doesn't clear the persisted key, so the backup still contains the chat.
  const hasChat = messages.length > 0;
  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent<ChatChangedDetail>(CHAT_CHANGED_EVENT, { detail: { present: hasChat } }),
    );
  }, [hasChat]);

  // Mutate a specific assistant message by index (escalation targets the clicked
  // card's message, which may not be the last one).
  const updateAssistantAt = useCallback(
    (index: number, fn: (m: AssistantMessage) => AssistantMessage) => {
      setMessages((prev) => {
        const m = prev[index];
        if (!m || m.role !== "assistant") return prev;
        const next = [...prev];
        next[index] = fn(m);
        return next;
      });
    },
    [],
  );

  // Reset to a fresh conversation: abort any in-flight turn and drop the resume
  // session id so the next message starts a new bridge session (no prior context).
  // The transcript is durable, backed-up data and this wipes it with no undo —
  // so a non-empty transcript gets the same confirm gate as the Notepad /
  // Initiative clears (a stray click or /clear must not destroy 200 messages).
  const newChat = useCallback(() => {
    if (
      messagesRef.current.length > 0 &&
      !window.confirm("Start a new chat? This permanently clears the saved transcript.")
    ) {
      return;
    }
    abortRef.current?.abort();
    abortRef.current = null;
    sessionIdRef.current = null;
    setMessages([]);
    setInput("");
    sendingRef.current = false;
    setSending(false);
    setPersistFailed(false);
  }, []);

  // Stream a bridge turn into a specific assistant message (identified by its
  // index in `messages`). Extracted so both a fresh send and an escalation
  // ("Ask Selene instead") share one implementation — escalation targets the
  // clicked card's message, which may not be the last one. Resolves `true` when
  // this turn settled as the current one (its writes landed), `false` when it
  // was superseded (e.g. "New chat" mid-stream) — so a caller can safely apply
  // follow-up state to the target message only when the turn really owned it.
  const streamTurn = useCallback(
    async (text: string, targetIndex: number): Promise<boolean> => {
      sendingRef.current = true;
      setSending(true);
      const abort = new AbortController();
      abortRef.current = abort;
      // This turn's abort controller doubles as its identity token. A turn
      // aborted via "New chat" can settle (reject + run catch/finally, or emit a
      // buffered event) after the *next* turn has already begun — and because
      // "New chat" clears the message list, `targetIndex` may now point at the
      // new turn's message. Gate every turn-global and index-targeted write on
      // still being the current turn so a stale settlement can't clobber the new
      // one's sending flags, abort handle, session id, or message content.
      const isCurrent = () => abortRef.current === abort;
      try {
        await streamChat(
          text,
          (event) => {
            if (!isCurrent()) return;
            // An event proves the bridge is reachable, which a stale "bridge
            // down" banner would be contradicting (the DM can start the bridge
            // without ever hitting Retry). Mutate the ref up front so the
            // remaining events in this turn don't each re-run this block.
            //
            // Refresh the footer's billing line only — deliberately NOT
            // refreshHealth. This event IS the reachability proof; letting a
            // concurrent /health probe re-decide `status` would mean a probe
            // that times out against a busy bridge could throw the "bridge not
            // running" banner back up mid-stream, and (since statusRef re-syncs
            // from `status` on the next render) re-arm this block to fire again
            // on the following event — one probe per token, banner flickering.
            if (statusRef.current !== "online") {
              statusRef.current = "online";
              setStatus("online");
              refreshBilling();
            }
            if (event.type === "text") {
              updateAssistantAt(targetIndex, (m) => ({ ...m, text: m.text + event.text }));
            } else if (event.type === "tool") {
              updateAssistantAt(targetIndex, (m) => ({ ...m, tools: [...m.tools, friendlyToolName(event.name)] }));
            } else if (event.type === "tool_result") {
              updateAssistantAt(targetIndex, (m) => ({ ...m, cards: [...m.cards, event] }));
            } else if (event.type === "tool_error") {
              updateAssistantAt(targetIndex, (m) => ({
                ...m,
                toolErrors: [...m.toolErrors, { tool: friendlyToolName(event.tool), message: event.message }],
              }));
            } else if (event.type === "error") {
              // A turn-level failure can mean the resumed bridge session was
              // rejected or evicted. Drop the session id so the next message
              // starts fresh instead of replaying the same failing resume id on
              // every subsequent turn (which would wedge the conversation).
              sessionIdRef.current = null;
              updateAssistantAt(targetIndex, (m) => ({ ...m, error: event.message, pending: false }));
            } else if (event.type === "done") {
              if (event.sessionId) sessionIdRef.current = event.sessionId;
              updateAssistantAt(targetIndex, (m) => {
                if (event.subtype === "success") return { ...m, text: m.text || event.result, pending: false };
                return { ...m, pending: false, error: m.error ?? `The assistant stopped early (${event.subtype}).` };
              });
            }
          },
          abort.signal,
          sessionIdRef.current ?? undefined,
          model,
          effort,
          // Size the stall watchdog above the bridge's reported turn cap so a
          // raised AI_BRIDGE_TURN_TIMEOUT_MS can't make the client give up early.
          stallTimeoutForTurn(healthRef.current?.turnTimeoutMs),
        );
      } catch (err) {
        // Superseded turn: leave all state (sending flags, status, messages) to
        // the turn that replaced it.
        if (!isCurrent()) return false;
        if (err instanceof DOMException && err.name === "AbortError") {
          updateAssistantAt(targetIndex, (m) => ({ ...m, pending: false, error: m.text ? undefined : "Cancelled." }));
        } else if (err instanceof BridgeUnreachableError) {
          // A failed POST /chat cannot itself tell "bridge down" from "origin
          // refused": the bridge reflects CORS headers on the 403 for GET
          // /health ONLY, so /chat's 403 is opaque to fetch and arrives as the
          // same TypeError a connection-refused does. Hard-coding "offline"
          // here would tell a DM whose origin isn't allowlisted to go start a
          // bridge that is already running. Re-probe /health, which CAN tell
          // them apart, and word both the banner and the bubble from whatever
          // it settles on. Both real cases answer immediately (connection
          // refused, or a 403 from a live bridge), so this await does not hold
          // the Stop button up for checkHealth's full timeout in practice.
          const settled = await refreshHealth();
          // Re-gate: `isCurrent` was checked before the await above, and "New
          // chat" during it would have re-pointed targetIndex at another turn's
          // message. (refreshHealth's own status/health writes are turn-global
          // and stay correct either way.)
          if (!isCurrent()) return false;
          // Raise the banner AND explain it on the message itself. The banner
          // sits above a still-mounted chat view (bundled-data lookups work
          // without the bridge), so this bubble does render — without it the
          // turn would just stop with no reason given.
          updateAssistantAt(targetIndex, (m) => ({
            ...m,
            pending: false,
            error: settled === "blocked" ? BRIDGE_BLOCKED_MESSAGE : BRIDGE_DOWN_MESSAGE,
          }));
        } else {
          updateAssistantAt(targetIndex, (m) => ({
            ...m,
            pending: false,
            error: err instanceof Error ? err.message : String(err),
          }));
        }
        return true;
      } finally {
        if (isCurrent()) {
          updateAssistantAt(targetIndex, (m) => ({ ...m, pending: false }));
          sendingRef.current = false;
          setSending(false);
          abortRef.current = null;
        }
      }
      return true;
    },
    [updateAssistantAt, model, effort, refreshHealth, refreshBilling],
  );

  // Build the local answer for a message, or null if it should go to the bridge.
  // Slash commands always produce a LocalAnswer (card / candidates / no-match /
  // hint); free text produces one only on a unique exact hit. Also returns the
  // sourceQuery (command arg, else the raw text) so callers don't have to parse
  // the command a second time.
  const routeLocal = useCallback((text: string): { answer: LocalAnswer; sourceQuery: string } | null => {
    const cmd = parseLookupCommand(text);
    const sourceQuery = cmd?.arg || text;
    if (cmd) {
      if (!cmd.arg) return { answer: { hint: `Type a name after /${cmd.dataset}, e.g. “/${cmd.dataset} ${cmd.dataset === "monster" ? "goblin" : cmd.dataset === "spell" ? "fireball" : "grappled"}”.` }, sourceQuery };
      const r = lookupDataset(cmd.dataset, cmd.arg);
      if (r.exact) return { answer: { card: r.exact }, sourceQuery };
      if (r.candidates.length > 0) return { answer: { candidates: r.candidates }, sourceQuery };
      return { answer: { noMatch: cmd.arg }, sourceQuery };
    }
    const card = autoDetectLocal(text);
    return card ? { answer: { card }, sourceQuery } : null;
  }, []);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text) return;

    // Slash commands: reset the conversation, matching /clear in the Claude CLI.
    // Handled client-side (they never reach the model as message text).
    if (text.toLowerCase() === "/clear" || text.toLowerCase() === "/new") {
      newChat();
      return;
    }
    if (sendingRef.current) return;

    const routed = routeLocal(text);
    setInput("");
    // A deliberate send re-pins the transcript so the reply is in view even if
    // the DM had scrolled up beforehand.
    pinnedRef.current = true;

    if (routed) {
      // Answered from bundled data — no bridge call, no tokens. Keep sourceQuery
      // (the command arg for a lookup, else the raw text) so "Ask Selene instead"
      // sends something sensible to the bridge.
      const { answer, sourceQuery } = routed;
      setMessages((prev) =>
        capChatMessages([
          ...prev,
          { id: mintMessageId(), role: "user", text },
          { id: mintMessageId(), role: "assistant", text: "", tools: [], cards: [], toolErrors: [], pending: false, local: answer, sourceQuery },
        ]),
      );
      return;
    }

    // Build the next transcript up front and apply BOTH caps here so
    // targetIndex is the pending assistant's REAL post-cap index. A count-only
    // formula (`min(len + 2, MAX) − 1`) is wrong now that capChatMessages also
    // enforces MAX_CHAT_BYTES: the byte cap can drop more messages than the
    // count cap, which would leave targetIndex pointing past the trimmed array
    // and the streamed reply written to a stale slot (lost + a stuck "Thinking…"
    // bubble). capChatMessages keeps most-recent, so the pending assistant is
    // always the last surviving element → its index is (length − 1). Read from
    // messagesRef (authoritative), not the `messages` closure (can be stale — a
    // local answer mutates messages without re-creating this callback).
    const next = capChatMessages([
      ...messagesRef.current,
      { id: mintMessageId(), role: "user", text },
      { id: mintMessageId(), role: "assistant", text: "", tools: [], cards: [], toolErrors: [], pending: true },
    ]);
    const targetIndex = next.length - 1;
    setMessages(next);
    await streamTurn(text, targetIndex);
  }, [input, newChat, routeLocal, streamTurn]);

  // Escalate a local answer: mark it escalated, flip to pending, and stream the
  // bridge answer into the SAME assistant message (renders below the local card).
  const escalate = useCallback(
    async (index: number, query: string) => {
      if (sendingRef.current) return;
      updateAssistantAt(index, (m) => ({ ...m, escalated: true, pending: true }));
      const ownedTurn = await streamTurn(query, index);
      // `escalated` was set optimistically above and is what hides the
      // "Ask Selene instead" link — a failed or aborted escalation must give
      // the link back, or one transient bridge hiccup removes the affordance
      // for good. A settled turn is a failure only if it errored or streamed
      // nothing to show: prose text OR a tool_result card both count as a
      // successful answer (a "look up X" escalation often returns a card with
      // no prose, which must NOT read as a failure). Only reset when this turn
      // still owned the message ("New chat" mid-stream must not touch whatever
      // now lives at this index).
      if (ownedTurn) {
        updateAssistantAt(index, (m) =>
          m.error || (!m.text && m.cards.length === 0) ? { ...m, escalated: false } : m,
        );
      }
    },
    [updateAssistantAt, streamTurn],
  );

  const stop = useCallback(() => abortRef.current?.abort(), []);

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !isImeComposing(e)) {
      e.preventDefault();
      void send();
    }
  };

  /* ── Checking reachability ── */
  if (status === "checking") {
    return (
      <div className="h-full flex items-center justify-center gap-2 text-xs" style={{ color: "var(--dm-t3)" }}>
        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Connecting to AI bridge…
      </div>
    );
  }

  /* ── Chat. Rendered for "online" AND for the two bridge-down states: the
     bundled-data lookups need no bridge, so the composer stays reachable and a
     banner explains what is (and isn't) available. ── */
  return (
    <div className="h-full flex flex-col min-h-0">
      {(status === "offline" || status === "blocked") && (
        // refreshHealth, not probe: probe's "checking" state replaces this whole
        // view, so retrying with a transcript on screen would blank it (and reset
        // its scroll) for the duration of the probe.
        <BridgeDownBanner
          status={status}
          onRetry={async () => {
            await refreshHealth();
          }}
        />
      )}
      {/* Header: new-chat reset (only once a conversation has started) */}
      {messages.length > 0 && (
        <div className="shrink-0 flex justify-end pb-1.5 mb-1.5 border-b" style={{ borderBottomColor: "var(--dm-border)" }}>
          <button
            onClick={newChat}
            title="Start a new conversation (clears context)"
            className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border border-amber-800/50 text-amber-300/80 hover:bg-amber-900/20 transition-colors"
          >
            <SquarePen className="w-2.5 h-2.5" /> New chat
          </button>
        </div>
      )}
      {/* Messages */}
      <div ref={scrollRef} onScroll={onTranscriptScroll} className="flex-1 min-h-0 overflow-y-auto pr-1 space-y-3">
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center gap-2 text-center px-4">
            <Sparkles className="w-6 h-6 text-amber-400/70" />
            <p className="text-xs leading-relaxed max-w-[16rem]" style={{ color: "var(--dm-t3)" }}>
              Ask about rules, or look things up instantly from your bundled data with{" "}
              <code className="px-1 py-0.5 rounded bg-black/30 text-amber-300/90">/spell</code>,{" "}
              <code className="px-1 py-0.5 rounded bg-black/30 text-amber-300/90">/monster</code>,{" "}
              <code className="px-1 py-0.5 rounded bg-black/30 text-amber-300/90">/rule</code>{" "}
              — or just type a name.
            </p>
          </div>
        )}
        {messages.map((m, i) =>
          m.role === "user" ? (
            // Keyed by the minted per-message id, NOT the index: at the
            // message cap every send shifts indexes, which would reattach
            // per-card component state (an open collision form) to the wrong
            // message.
            <div key={m.id} className="flex justify-end">
              <div className="max-w-[85%] rounded-lg rounded-br-sm px-2.5 py-1.5 text-xs whitespace-pre-wrap break-words bg-amber-900/25 border border-amber-800/40" style={{ color: "var(--dm-t2)" }}>
                {m.text}
              </div>
            </div>
          ) : (
            <div key={m.id} className="flex flex-col gap-1">
              {m.tools.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {m.tools.map((t, j) => (
                    <span
                      key={j}
                      className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border border-cyan-800/50 text-cyan-300/80 bg-cyan-950/30"
                    >
                      <Search className="w-2.5 h-2.5" /> {t}
                    </span>
                  ))}
                </div>
              )}
              {m.cards.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  {m.cards.map((c, j) => (<ChatToolCard key={j} card={c} />))}
                </div>
              )}
              {m.toolErrors.length > 0 && (
                <div className="flex flex-col gap-1">
                  {m.toolErrors.map((te, j) => (
                    <div key={j} className="flex items-start gap-1.5 text-xs text-red-400/90">
                      <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
                      <span className="whitespace-pre-wrap break-words">
                        <span className="font-semibold">{te.tool}:</span> {te.message}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              {m.local && (
                <ChatLocalAnswer
                  answer={m.local}
                  escalated={!!m.escalated}
                  onEscalate={(query) => {
                    const q = query || m.sourceQuery;
                    if (q) void escalate(i, q);
                  }}
                />
              )}
              {m.text && (
                <div className="max-w-[92%]" style={{ color: "var(--dm-t2)" }}>
                  <MiniMarkdown text={m.text} variant="prose" />
                </div>
              )}
              {m.pending && !m.text && m.tools.length === 0 && m.cards.length === 0 && m.toolErrors.length === 0 && (
                <div className="flex items-center gap-1.5 text-xs" style={{ color: "var(--dm-t3)" }}>
                  <Loader2 className="w-3 h-3 animate-spin" /> Thinking…
                </div>
              )}
              {m.error && (
                <div className="flex items-start gap-1.5 text-xs text-red-400/90">
                  <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
                  <span className="whitespace-pre-wrap break-words">{m.error}</span>
                </div>
              )}
            </div>
          ),
        )}
      </div>

      {/* Persist failure: storage writes are throwing (quota / private mode),
          so the transcript above is in-memory only and gone on reload. */}
      {persistFailed && (
        <div className="shrink-0 mt-1.5 flex items-start gap-1.5 text-[10px] rounded border border-amber-700/50 bg-amber-950/30 px-2 py-1 text-amber-300/90">
          <AlertTriangle className="w-3 h-3 mt-px shrink-0" />
          <span>
            Chat history can't be saved — browser storage is full. This conversation will be lost
            on reload; use New chat to free space.
          </span>
        </div>
      )}
      {/* Composer */}
      <div className="shrink-0 pt-2 mt-2 border-t" style={{ borderTopColor: "var(--dm-border)" }}>
        <div className="flex items-end gap-1.5">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            rows={1}
            placeholder="Ask Selene…"
            className="flex-1 resize-none max-h-24 text-xs px-2 py-1.5 rounded-md bg-black/20 border outline-none focus:border-amber-600/60"
            style={{ borderColor: "var(--dm-border)", color: "var(--dm-t2)" }}
          />
          {sending ? (
            <button
              onClick={stop}
              title="Stop"
              className="shrink-0 w-8 h-8 flex items-center justify-center rounded-md border border-red-700/50 text-red-300/90 hover:bg-red-900/20 transition-colors"
            >
              <Square className="w-3.5 h-3.5" />
            </button>
          ) : (
            <button
              onClick={() => void send()}
              disabled={!input.trim()}
              title="Send"
              className="shrink-0 w-8 h-8 flex items-center justify-center rounded-md border border-amber-700/50 text-amber-300/90 hover:bg-amber-900/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <div className="mt-1.5 flex items-center gap-1.5 flex-wrap text-[10px]" style={{ color: "var(--dm-t3)" }}>
          <FooterPicker<string> value={model} options={MODELS} onChange={setModel} title="Model" />
          <span className="opacity-40">·</span>
          <span>Effort:</span>
          <FooterPicker<EffortLevel> value={effort} options={EFFORTS} onChange={setEffort} title="Reasoning effort" />
          {health && (
            <>
              <span className="opacity-40">·</span>
              <span className="inline-flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500/80" />
                {BILLING_LABELS[health.billing] ?? health.billing}
                {!health.ddbMcpFound && " · no D&D Beyond tools"}
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
