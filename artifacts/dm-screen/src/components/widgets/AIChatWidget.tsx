import { useEffect, useRef, useState, useCallback } from "react";
import { Sparkles, Send, Loader2, Search, AlertTriangle, RefreshCw, Square, SquarePen } from "lucide-react";
import {
  checkHealth,
  streamChat,
  friendlyToolName,
  BridgeUnreachableError,
  type BridgeHealth,
} from "@/lib/aiBridge";

// Phase 2: chat shell only. Talks to the optional local AI bridge, streams the
// assistant reply, and degrades to a clear "bridge not running" state when the
// bridge is unreachable. No persistence yet (session React state) — chat history
// persistence is a later phase. Structured preview cards + "Add to ___" hand-off
// (tool events beyond a lightweight indicator) also land in later phases.

interface AssistantMessage {
  role: "assistant";
  text: string;
  tools: string[];
  error?: string;
  pending: boolean;
}
interface UserMessage {
  role: "user";
  text: string;
}
type ChatMessage = UserMessage | AssistantMessage;

type BridgeStatus = "checking" | "online" | "offline";

export function AIChatWidget() {
  const [status, setStatus] = useState<BridgeStatus>("checking");
  const [health, setHealth] = useState<BridgeHealth | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  // The bridge's Agent-SDK session for this conversation. Captured from each
  // turn's `done` event and echoed back on the next turn so follow-up questions
  // keep context. Resets when the widget remounts (tile closed/reopened).
  const sessionIdRef = useRef<string | null>(null);

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

  // Mutate the trailing assistant message in place as events stream in.
  const updateLastAssistant = useCallback(
    (fn: (m: AssistantMessage) => AssistantMessage) => {
      setMessages((prev) => {
        const next = [...prev];
        for (let i = next.length - 1; i >= 0; i--) {
          const m = next[i];
          if (m.role === "assistant") {
            next[i] = fn(m);
            break;
          }
        }
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
    setSending(false);
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
    if (sending) return;

    setInput("");
    setSending(true);
    setMessages((prev) => [
      ...prev,
      { role: "user", text },
      { role: "assistant", text: "", tools: [], pending: true },
    ]);

    const abort = new AbortController();
    abortRef.current = abort;

    try {
      await streamChat(
        text,
        (event) => {
          if (event.type === "text") {
            updateLastAssistant((m) => ({ ...m, text: m.text + event.text }));
          } else if (event.type === "tool") {
            updateLastAssistant((m) => ({
              ...m,
              tools: [...m.tools, friendlyToolName(event.name)],
            }));
          } else if (event.type === "error") {
            // A turn-level failure can mean the resumed bridge session was
            // rejected or evicted. Drop the session id so the next message
            // starts fresh instead of replaying the same failing resume id on
            // every subsequent turn (which would wedge the conversation).
            sessionIdRef.current = null;
            updateLastAssistant((m) => ({ ...m, error: event.message, pending: false }));
          } else if (event.type === "done") {
            if (event.sessionId) sessionIdRef.current = event.sessionId;
            updateLastAssistant((m) => {
              if (event.subtype === "success") {
                // If the model streamed no text blocks, fall back to the result.
                return { ...m, text: m.text || event.result, pending: false };
              }
              // Non-success terminal (e.g. max turns hit). Keep whatever text
              // streamed, but never leave a silent blank bubble — surface why.
              return {
                ...m,
                pending: false,
                error: m.error ?? `The assistant stopped early (${event.subtype}).`,
              };
            });
          }
        },
        abort.signal,
        sessionIdRef.current ?? undefined,
      );
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        updateLastAssistant((m) => ({ ...m, pending: false, error: m.text ? undefined : "Cancelled." }));
      } else if (err instanceof BridgeUnreachableError) {
        // Flip to the "bridge not running" screen, which replaces the whole
        // chat view — so a per-message error bubble here would never render.
        setStatus("offline");
      } else {
        updateLastAssistant((m) => ({
          ...m,
          pending: false,
          error: err instanceof Error ? err.message : String(err),
        }));
      }
    } finally {
      updateLastAssistant((m) => ({ ...m, pending: false }));
      setSending(false);
      abortRef.current = null;
    }
  }, [input, sending, updateLastAssistant, newChat]);

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
              Ask about rules, look up a monster or spell, or check a player's D&D Beyond character.
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
              {m.text && (
                <div className="max-w-[92%] text-xs whitespace-pre-wrap break-words leading-relaxed" style={{ color: "var(--dm-t2)" }}>
                  {m.text}
                </div>
              )}
              {m.pending && !m.text && m.tools.length === 0 && (
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
        {health && (
          <div className="mt-1 text-[10px] flex items-center gap-1" style={{ color: "var(--dm-t3)" }}>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500/80" />
            Bridge online · {health.billing}
            {health.billing === "subscription" ? " (Claude subscription)" : ""}
            {!health.ddbMcpFound && " · D&D Beyond tools unavailable"}
          </div>
        )}
      </div>
    </div>
  );
}
