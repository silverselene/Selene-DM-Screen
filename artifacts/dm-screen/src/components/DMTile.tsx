import { Plus, X, BookOpen, Swords, FileText, Wand2, Skull, BookMarked, ArrowRight, ArrowDown, Minimize2 } from "lucide-react";
import type { TileEntry, WidgetType } from "@/types";
import { CompendiumWidget } from "./widgets/CompendiumWidget";
import { InitiativeWidget } from "./widgets/InitiativeWidget";
import { NotepadWidget } from "./widgets/NotepadWidget";
import { OracleWidget } from "./widgets/OracleWidget";
import { BestiaryWidget } from "./widgets/BestiaryWidget";
import { WizardsTomeWidget } from "./widgets/WizardsTomeWidget";

interface Props {
  index: number;
  entry: TileEntry;
  onAdd: () => void;
  onClear: () => void;
  canExpandRight: boolean;
  canExpandDown: boolean;
  canExpandBoth: boolean;
  onExpandRight: () => void;
  onExpandDown: () => void;
  onExpandBoth: () => void;
  onContractRight: () => void;
  onContractDown: () => void;
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
};

function WidgetContent({ widget }: { widget: WidgetType }) {
  if (widget === "compendium") return <CompendiumWidget />;
  if (widget === "initiative") return <InitiativeWidget />;
  if (widget === "notepad") return <NotepadWidget />;
  if (widget === "oracle") return <OracleWidget />;
  if (widget === "bestiary") return <BestiaryWidget />;
  if (widget === "wizard-tome") return <WizardsTomeWidget />;
  return null;
}

export function DMTile({
  entry, onAdd, onClear,
  canExpandRight, canExpandDown,
  onExpandRight, onExpandDown,
  onContractRight, onContractDown,
}: Props) {
  if (!entry) return null;

  const { widget, colSpan, rowSpan } = entry;
  const isStretched = colSpan > 1 || rowSpan > 1;

  if (widget === "empty") {
    return (
      <div className="relative h-full rounded-lg border-2 border-dashed border-purple-900/40 hover:border-purple-600/60 transition-all group flex items-center justify-center bg-gray-950/30 hover:bg-purple-950/10">
        <button
          onClick={onAdd}
          className="flex items-center justify-center text-purple-700 hover:text-purple-400 transition-colors"
        >
          <div className="w-8 h-8 rounded-full border border-current flex items-center justify-center group-hover:shadow-[0_0_10px_rgba(139,43,226,0.3)] transition-all">
            <Plus className="w-4 h-4" />
          </div>
        </button>
      </div>
    );
  }

  const meta = widgetMeta[widget];

  return (
    <div
      className={`relative h-full rounded-lg border bg-gray-950/80 ${meta.accent} hover:shadow-[0_0_16px_rgba(139,43,226,0.12)] transition-all flex flex-col overflow-hidden`}
      style={{
        backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='4' height='4'%3E%3Cpath d='M0 0h4v4H0z' fill='%23111' /%3E%3Cpath d='M0 0h1v1H0z' fill='%23161616' /%3E%3C/svg%3E\")",
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-2.5 py-1.5 border-b border-gray-800/60 shrink-0">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-400">
          <span className="text-white/60">{meta.icon}</span>
          {meta.label}
        </div>

        <div className="flex items-center gap-0.5">
          {/* Expand controls */}
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
          {/* Contract controls */}
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
      <div className="flex-1 overflow-hidden p-2.5">
        <WidgetContent widget={widget} />
      </div>
    </div>
  );
}
