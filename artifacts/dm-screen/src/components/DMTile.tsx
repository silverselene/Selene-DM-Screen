import {
  Plus, X, BookOpen, Swords, FileText, Wand2, Skull, BookMarked, Users,
  ArrowRight, ArrowDown, Minimize2,
} from "lucide-react";
import type { TileEntry, WidgetType } from "@/types";
import { CompendiumWidget } from "./widgets/CompendiumWidget";
import { InitiativeWidget } from "./widgets/InitiativeWidget";
import { NotepadWidget } from "./widgets/NotepadWidget";
import { OracleWidget } from "./widgets/OracleWidget";
import { BestiaryWidget } from "./widgets/BestiaryWidget";
import { WizardsTomeWidget } from "./widgets/WizardsTomeWidget";
import { PartyWidget } from "./widgets/PartyWidget";

interface Props {
  index: number;
  entry: TileEntry;
  cols: number;
  onAdd: () => void;
  onClear: () => void;
  canExpandRight: boolean;
  canExpandDown: boolean;
  onExpandRight: () => void;
  onExpandDown: () => void;
  onContractRight: () => void;
  onContractDown: () => void;
  bestiaryTarget?: string | null;
  onBestiaryTargetClear?: () => void;
}

const widgetMeta: Record<Exclude<WidgetType, "empty">, { label: string; icon: React.ReactNode; accent: string }> = {
  compendium: {
    label: "5.5e Compendium",
    icon: <BookOpen className="w-3 h-3" />,
    accent: "border-blue-700/60 shadow-[inset_0_0_20px_rgba(59,130,246,0.05)]",
  },
  initiative: {
    label: "Initiative",
    icon: <Swords className="w-3 h-3" />,
    accent: "border-red-700/60 shadow-[inset_0_0_20px_rgba(239,68,68,0.05)]",
  },
  notepad: {
    label: "Notepad",
    icon: <FileText className="w-3 h-3" />,
    accent: "border-green-700/60 shadow-[inset_0_0_20px_rgba(34,197,94,0.05)]",
  },
  oracle: {
    label: "The Oracle",
    icon: <Wand2 className="w-3 h-3" />,
    accent: "border-purple-700/60 shadow-[inset_0_0_20px_rgba(139,43,226,0.08)]",
  },
  bestiary: {
    label: "Bestiary",
    icon: <Skull className="w-3 h-3" />,
    accent: "border-rose-800/60 shadow-[inset_0_0_20px_rgba(225,29,72,0.05)]",
  },
  "wizard-tome": {
    label: "Wizard's Tome",
    icon: <BookMarked className="w-3 h-3" />,
    accent: "border-cyan-800/60 shadow-[inset_0_0_20px_rgba(6,182,212,0.05)]",
  },
  party: {
    label: "Party",
    icon: <Users className="w-3 h-3" />,
    accent: "border-emerald-800/60 shadow-[inset_0_0_20px_rgba(16,185,129,0.05)]",
  },
};

function WidgetContent({
  widget,
  bestiaryTarget,
  onBestiaryTargetClear,
}: {
  widget: WidgetType;
  bestiaryTarget?: string | null;
  onBestiaryTargetClear?: () => void;
}) {
  if (widget === "compendium") return <CompendiumWidget />;
  if (widget === "initiative") return <InitiativeWidget />;
  if (widget === "notepad") return <NotepadWidget />;
  if (widget === "oracle") return <OracleWidget />;
  if (widget === "bestiary") return <BestiaryWidget target={bestiaryTarget} onTargetClear={onBestiaryTargetClear} />;
  if (widget === "wizard-tome") return <WizardsTomeWidget />;
  if (widget === "party") return <PartyWidget />;
  return null;
}

export function DMTile({
  entry, onAdd, onClear,
  canExpandRight, canExpandDown,
  onExpandRight, onExpandDown,
  onContractRight, onContractDown,
  bestiaryTarget, onBestiaryTargetClear,
}: Props) {
  if (!entry) return null;

  const { widget } = entry;
  const colSpan = (entry as { colSpan: number }).colSpan ?? 1;
  const rowSpan = (entry as { rowSpan: number }).rowSpan ?? 1;
  const isStretched = colSpan > 1 || rowSpan > 1;

  /* ── Empty tile ── */
  if (widget === "empty") {
    return (
      <div className="relative h-full rounded-lg border-2 border-dashed border-purple-900/40 hover:border-purple-700/60 transition-all group flex items-center justify-center hover:bg-purple-950/10" style={{ background: "var(--dm-bg-tile)" }}>
        {/* Center add button */}
        <button
          onClick={onAdd}
          className="flex items-center justify-center text-purple-700 hover:text-purple-400 transition-colors"
        >
          <div className="w-8 h-8 rounded-full border border-current flex items-center justify-center group-hover:shadow-[0_0_10px_rgba(139,43,226,0.3)] transition-all">
            <Plus className="w-4 h-4" />
          </div>
        </button>

        {/* Resize controls — visible on hover */}
        <div className="absolute inset-0 pointer-events-none">
          {/* Expand right handle */}
          {canExpandRight && (
            <button
              onClick={onExpandRight}
              title="Stretch right"
              className="pointer-events-auto absolute right-1 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center text-purple-800 hover:text-purple-400 opacity-0 group-hover:opacity-100 transition-all rounded bg-purple-950/60 border border-purple-800/40 hover:border-purple-500"
            >
              <ArrowRight className="w-3 h-3" />
            </button>
          )}
          {/* Expand down handle */}
          {canExpandDown && (
            <button
              onClick={onExpandDown}
              title="Stretch down"
              className="pointer-events-auto absolute bottom-1 left-1/2 -translate-x-1/2 w-5 h-5 flex items-center justify-center text-purple-800 hover:text-purple-400 opacity-0 group-hover:opacity-100 transition-all rounded bg-purple-950/60 border border-purple-800/40 hover:border-purple-500"
            >
              <ArrowDown className="w-3 h-3" />
            </button>
          )}
          {/* Contract handles */}
          {colSpan > 1 && (
            <button
              onClick={onContractRight}
              title="Contract width"
              className="pointer-events-auto absolute right-1 top-1 w-5 h-5 flex items-center justify-center text-purple-500 hover:text-purple-300 opacity-0 group-hover:opacity-100 transition-all rounded bg-purple-950/60 border border-purple-700/40"
            >
              <Minimize2 className="w-3 h-3" />
            </button>
          )}
          {rowSpan > 1 && colSpan === 1 && (
            <button
              onClick={onContractDown}
              title="Contract height"
              className="pointer-events-auto absolute right-1 top-1 w-5 h-5 flex items-center justify-center text-purple-500 hover:text-purple-300 opacity-0 group-hover:opacity-100 transition-all rounded bg-purple-950/60 border border-purple-700/40"
            >
              <Minimize2 className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>
    );
  }

  /* ── Widget tile ── */
  const meta = widgetMeta[widget];

  return (
    <div
      className={`relative h-full rounded-lg border ${meta.accent} hover:shadow-[0_0_16px_rgba(139,43,226,0.12)] transition-all flex flex-col overflow-hidden`}
      style={{ background: "var(--dm-bg-tile)" }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-2.5 py-1.5 border-b shrink-0" style={{ borderBottomColor: "var(--dm-border)" }}>
        <div className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: "var(--dm-t2)" }}>
          <span className="text-white/60">{meta.icon}</span>
          {meta.label}
        </div>

        <div className="flex items-center gap-0.5">
          {canExpandRight && (
            <button
              onClick={onExpandRight}
              title="Stretch right"
              className="w-5 h-5 flex items-center justify-center text-gray-600 hover:text-purple-400 transition-colors rounded hover:bg-purple-900/30"
            >
              <ArrowRight className="w-3 h-3" />
            </button>
          )}
          {canExpandDown && (
            <button
              onClick={onExpandDown}
              title="Stretch down"
              className="w-5 h-5 flex items-center justify-center text-gray-600 hover:text-purple-400 transition-colors rounded hover:bg-purple-900/30"
            >
              <ArrowDown className="w-3 h-3" />
            </button>
          )}
          {colSpan > 1 && (
            <button
              onClick={onContractRight}
              title="Contract width"
              className="w-5 h-5 flex items-center justify-center text-purple-600 hover:text-purple-300 transition-colors rounded hover:bg-purple-900/30"
            >
              <Minimize2 className="w-3 h-3" />
            </button>
          )}
          {rowSpan > 1 && colSpan === 1 && (
            <button
              onClick={onContractDown}
              title="Contract height"
              className="w-5 h-5 flex items-center justify-center text-purple-600 hover:text-purple-300 transition-colors rounded hover:bg-purple-900/30"
            >
              <Minimize2 className="w-3 h-3" />
            </button>
          )}
          {isStretched && <div className="w-px h-3 bg-gray-700 mx-0.5" />}
          <button
            onClick={onClear}
            className="w-5 h-5 flex items-center justify-center text-gray-700 hover:text-red-400 transition-colors rounded hover:bg-red-900/20"
            title="Remove widget"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-hidden p-2.5">
        <WidgetContent widget={widget} bestiaryTarget={bestiaryTarget} onBestiaryTargetClear={onBestiaryTargetClear} />
      </div>
    </div>
  );
}
