import { useState } from "react";
import { BookOpen, Sparkles } from "lucide-react";
import { ChatToolCard } from "./ChatToolCard";
import type { ToolResultCard } from "@/lib/cardHandoff";
// LocalAnswer lives in the React-free chatHistory module (so the persistence
// validator can reference it without pulling a widget `.tsx` into backup.ts's
// import graph); re-exported here for existing importers.
import type { LocalAnswer } from "@/lib/chatHistory";
export type { LocalAnswer };

/**
 * Renders one bundled-data answer: a provenance line, then either the card, a
 * "did you mean" candidate list, a "no match" line, or a usage hint. An
 * escalate link ("Ask Selene instead") is shown unless already escalated or the
 * answer is a bare-command usage hint (a nudge, not an answer — escalating it
 * would POST the literal command text). All state beyond the local
 * candidate-pick lives on the parent message.
 *
 * `onEscalate` takes the query to send: the picked candidate's name once the DM
 * has chosen one from the "did you mean" list, otherwise undefined so the parent
 * falls back to the original query.
 */
export function ChatLocalAnswer({
  answer,
  escalated,
  onEscalate,
}: {
  answer: LocalAnswer;
  escalated: boolean;
  onEscalate: (query?: string) => void;
}) {
  // A picked candidate is rendered in place of the list (session-local to this
  // card). Keep the name too so escalation asks about the chosen entity.
  const [picked, setPicked] = useState<{ name: string; card: ToolResultCard } | null>(null);
  const shownCard = answer.card ?? picked?.card;

  return (
    <div className="flex flex-col gap-1">
      <div className="inline-flex items-center gap-1 text-[10px]" style={{ color: "var(--dm-t3)" }}>
        <BookOpen className="w-2.5 h-2.5" /> From your bundled data
      </div>

      {answer.hint && (
        <div className="text-xs" style={{ color: "var(--dm-t3)" }}>{answer.hint}</div>
      )}

      {shownCard && <ChatToolCard card={shownCard} />}

      {!shownCard && answer.candidates && answer.candidates.length > 0 && (
        <div className="flex flex-col gap-1">
          <div className="text-[10px]" style={{ color: "var(--dm-t3)" }}>Did you mean:</div>
          <div className="flex flex-wrap gap-1">
            {answer.candidates.map((c) => (
              <button
                key={c.name}
                onClick={() => setPicked(c)}
                className="text-[11px] px-1.5 py-0.5 rounded border border-amber-800/50 text-amber-300/80 hover:bg-amber-900/30 transition-colors"
              >
                {c.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {answer.noMatch && !shownCard && (
        <div className="text-xs" style={{ color: "var(--dm-t3)" }}>
          No match in bundled data for "{answer.noMatch}".
        </div>
      )}

      {!escalated && !answer.hint && (
        <button
          onClick={() => onEscalate(picked?.name)}
          className="self-start inline-flex items-center gap-1 text-[10px] text-amber-300/70 hover:text-amber-200/90 transition-colors"
        >
          <Sparkles className="w-2.5 h-2.5" /> Ask Selene instead →
        </button>
      )}
    </div>
  );
}
