import { useEffect, useRef, useState, useCallback } from "react";
import { Sparkles, Send, Loader2, Search, AlertTriangle, RefreshCw, Square, SquarePen, ChevronDown } from "lucide-react";
import {
  checkHealth,
  streamChat,
  friendlyToolName,
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
import {
  CHAT_HISTORY_KEY,
  CHAT_CHANGED_EVENT,
  MAX_CHAT_MESSAGES,
  capChatMessages,
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
            onMouseDown={(e) => {
              e.preventDefault();
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

// Phase 2: chat shell only. Talks to the optional local AI bridge, streams the
// assistant reply, and degrades to a clear "bridge not running" state when the
// bridge is unreachable. No persistence yet (session React state) — chat history
// persistence is a later phase. Structured preview cards + "Add to ___" hand-off
// (tool events beyond a lightweight indicator) also land in later phases.

// Message types (ChatMessage / AssistantMessage / UserMessage) live in the
// React-free @/lib/chatHistory module so the persistence validator can share
// them; imported above.

type BridgeStatus = "checking" | "online" | "offline";

export function AIChatWidget() {
  const [status, setStatus] = useState<BridgeStatus>("checking");
  const [health, setHealth] = useState<BridgeHealth | null>(null);
  // Persisted transcript. The hook debounces writes (streaming mutates
  // `messages` per token) and flushes on pagehide / tab-hidden / unmount /
  // before a backup sweep. `validateChatHistory` forces every restored
  // assistant message non-pending, so a reload shows history with no ghost
  // "Thinking…". The bridge resume/session id is intentionally NOT persisted
  // (`sessionIdRef` starts null), so the first post-reload turn starts fresh.
  const [messages, setMessages] = useLocalStorage<ChatMessage[]>(
    CHAT_HISTORY_KEY,
    [],
    validateChatHistory,
    { debounceWriteMs: 500 },
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
  // Synchronous in-flight guard. `sending` state lags a render behind, so a fast
  // double Enter/click could fire two turns before it flips; this ref is set the
  // instant a bridge turn begins and read by the send/escalate guards.
  const sendingRef = useRef(false);

  const probe = useCallback(async () => {
    setStatus("checking");
    try {
      const h = await checkHealth();
      setHealth(h);
      setStatus("online");
    } catch {
      setHealth(null);
      setStatus("offline");
    }
  }, []);

  useEffect(() => {
    void probe();
  }, [probe]);

  // Auto-scroll to the newest content as the reply streams in.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
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
  const newChat = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    sessionIdRef.current = null;
    setMessages([]);
    setInput("");
    sendingRef.current = false;
    setSending(false);
  }, []);

  // Stream a bridge turn into a specific assistant message (identified by its
  // index in `messages`). Extracted so both a fresh send and an escalation
  // ("Ask Selene instead") share one implementation — escalation targets the
  // clicked card's message, which may not be the last one.
  const streamTurn = useCallback(
    async (text: string, targetIndex: number) => {
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
        );
      } catch (err) {
        // Superseded turn: leave all state (sending flags, status, messages) to
        // the turn that replaced it.
        if (!isCurrent()) return;
        if (err instanceof DOMException && err.name === "AbortError") {
          updateAssistantAt(targetIndex, (m) => ({ ...m, pending: false, error: m.text ? undefined : "Cancelled." }));
        } else if (err instanceof BridgeUnreachableError) {
          // Flip to the "bridge not running" screen, which replaces the whole
          // chat view — so a per-message error bubble here would never render.
          setStatus("offline");
        } else {
          updateAssistantAt(targetIndex, (m) => ({
            ...m,
            pending: false,
            error: err instanceof Error ? err.message : String(err),
          }));
        }
      } finally {
        if (isCurrent()) {
          updateAssistantAt(targetIndex, (m) => ({ ...m, pending: false }));
          sendingRef.current = false;
          setSending(false);
          abortRef.current = null;
        }
      }
    },
    [updateAssistantAt, model, effort],
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

    if (routed) {
      // Answered from bundled data — no bridge call, no tokens. Keep sourceQuery
      // (the command arg for a lookup, else the raw text) so "Ask Selene instead"
      // sends something sensible to the bridge.
      const { answer, sourceQuery } = routed;
      setMessages((prev) =>
        capChatMessages([
          ...prev,
          { role: "user", text },
          { role: "assistant", text: "", tools: [], cards: [], toolErrors: [], pending: false, local: answer, sourceQuery },
        ]),
      );
      return;
    }

    // Index of the assistant message we're about to append. It always lands
    // last, so after the keep-most-recent cap its index is (capped length − 1).
    // `Math.min(len + 2, MAX) − 1` collapses to the pre-cap `len + 1` when no
    // trimming happens, and stays correct when the append pushes past the cap
    // and the oldest entries are dropped. Read from messagesRef (authoritative
    // length), not a setState-updater side-effect (runs too late) nor the
    // `messages` closure (can be stale — a local answer mutates messages
    // without re-creating this callback).
    const targetIndex = Math.min(messagesRef.current.length + 2, MAX_CHAT_MESSAGES) - 1;
    setMessages((prev) =>
      capChatMessages([
        ...prev,
        { role: "user", text },
        { role: "assistant", text: "", tools: [], cards: [], toolErrors: [], pending: true },
      ]),
    );
    await streamTurn(text, targetIndex);
  }, [input, newChat, routeLocal, streamTurn]);

  // Escalate a local answer: mark it escalated, flip to pending, and stream the
  // bridge answer into the SAME assistant message (renders below the local card).
  const escalate = useCallback(
    async (index: number, query: string) => {
      if (sendingRef.current) return;
      updateAssistantAt(index, (m) => ({ ...m, escalated: true, pending: true }));
      await streamTurn(query, index);
    },
    [updateAssistantAt, streamTurn],
  );

  const stop = useCallback(() => abortRef.current?.abort(), []);

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  };

  /* ── Bridge not running ── */
  if (status === "offline") {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 text-center px-4">
        <AlertTriangle className="w-7 h-7 text-amber-500/80" />
        <div className="text-sm font-semibold" style={{ color: "var(--dm-t2)" }}>
          AI bridge not running
        </div>
        <p className="text-xs leading-relaxed max-w-[16rem]" style={{ color: "var(--dm-t3)" }}>
          The chat assistant needs the optional local bridge. Start it with{" "}
          <code className="px-1 py-0.5 rounded bg-black/30 text-amber-300/90">pnpm dev:ai</code>{" "}
          (or <code className="px-1 py-0.5 rounded bg-black/30 text-amber-300/90">pnpm dev</code>,
          which runs it alongside the app), then retry.
        </p>
        <button
          onClick={() => void probe()}
          className="mt-1 flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-amber-700/50 text-amber-300/90 hover:bg-amber-900/20 transition-colors"
        >
          <RefreshCw className="w-3 h-3" /> Retry
        </button>
      </div>
    );
  }

  /* ── Checking reachability ── */
  if (status === "checking") {
    return (
      <div className="h-full flex items-center justify-center gap-2 text-xs" style={{ color: "var(--dm-t3)" }}>
        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Connecting to AI bridge…
      </div>
    );
  }

  /* ── Online: chat ── */
  return (
    <div className="h-full flex flex-col min-h-0">
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
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto pr-1 space-y-3">
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
            <div key={i} className="flex justify-end">
              <div className="max-w-[85%] rounded-lg rounded-br-sm px-2.5 py-1.5 text-xs whitespace-pre-wrap break-words bg-amber-900/25 border border-amber-800/40" style={{ color: "var(--dm-t2)" }}>
                {m.text}
              </div>
            </div>
          ) : (
            <div key={i} className="flex flex-col gap-1">
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
                {health.billing}
                {!health.ddbMcpFound && " · no D&D Beyond tools"}
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
