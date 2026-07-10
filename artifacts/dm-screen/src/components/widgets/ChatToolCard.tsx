import { useState } from "react";
import { ChevronRight, Skull, Shield, ScrollText } from "lucide-react";
import type { BridgeEvent } from "@/lib/aiBridge";
import { MiniMarkdown } from "@/lib/miniMarkdown";

export type ToolResultCard = Extract<BridgeEvent, { type: "tool_result" }>;

// Ordered field keys per kind → which chips to show and their labels. Keys the
// bridge didn't extract are simply skipped (best-effort fields).
const CHIP_ORDER: Record<string, [key: string, label: string][]> = {
  monster: [["ac", "AC"], ["hp", "HP"], ["cr", "CR"], ["speed", "Speed"]],
  character: [["level", "Lvl"], ["class", "Class"], ["hp", "HP"], ["ac", "AC"], ["initiative", "Init"]],
};

function cardIcon(kind: string) {
  if (kind === "monster") return <Skull className="w-3.5 h-3.5 text-amber-400/80" />;
  if (kind === "character") return <Shield className="w-3.5 h-3.5 text-amber-400/80" />;
  return <ScrollText className="w-3.5 h-3.5 text-amber-400/80" />;
}

// The monster subtitle (type/alignment) and character race read best as a line
// under the title rather than a chip.
function subtitle(card: ToolResultCard): string | undefined {
  if (card.kind === "monster") return card.fields?.type;
  if (card.kind === "character") return card.fields?.race;
  return undefined;
}

export function ChatToolCard({ card }: { card: ToolResultCard }) {
  const [open, setOpen] = useState(false);
  const chips = (CHIP_ORDER[card.kind] ?? [])
    .map(([key, label]) => (card.fields?.[key] ? { label, value: card.fields[key] } : null))
    .filter((c): c is { label: string; value: string } => c !== null);
  const sub = subtitle(card);

  return (
    <div className="rounded-lg border border-amber-800/40 bg-amber-950/20 px-2.5 py-2">
      <div className="flex items-center gap-1.5">
        {cardIcon(card.kind)}
        <span className="text-xs font-semibold" style={{ color: "var(--dm-t1)" }}>{card.title}</span>
      </div>
      {sub && <div className="mt-0.5 text-[10px] italic" style={{ color: "var(--dm-t3)" }}>{sub}</div>}
      {chips.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {chips.map((c) => (
            <span key={c.label} className="inline-flex items-baseline gap-1 text-[10px] px-1.5 py-0.5 rounded border border-amber-800/40 bg-black/20">
              <span className="uppercase tracking-wide text-amber-300/70">{c.label}</span>
              <span style={{ color: "var(--dm-t2)" }}>{c.value}</span>
            </span>
          ))}
        </div>
      )}
      {chips.length === 0 ? (
        // No structured fields parsed (generic lookups, or a rich parse that
        // extracted nothing) — the raw text IS the content, so show it inline
        // rather than hide the only meaningful part behind a toggle.
        <div className="mt-1.5 pt-1.5 border-t" style={{ borderColor: "var(--dm-border)" }}>
          <MiniMarkdown text={card.markdown} />
        </div>
      ) : (
        // Chips already summarize the result; keep the full block available but
        // collapsed so it doesn't crowd the card.
        <>
          <button
            onClick={() => setOpen((v) => !v)}
            className="mt-1.5 flex items-center gap-1 text-[10px] text-amber-300/70 hover:text-amber-200/90 transition-colors"
          >
            <ChevronRight className={`w-3 h-3 transition-transform ${open ? "rotate-90" : ""}`} />
            {open ? "Hide details" : "Full stat block"}
          </button>
          {open && (
            <div className="mt-1.5 pt-1.5 border-t" style={{ borderColor: "var(--dm-border)" }}>
              <MiniMarkdown text={card.markdown} />
            </div>
          )}
        </>
      )}
    </div>
  );
}
