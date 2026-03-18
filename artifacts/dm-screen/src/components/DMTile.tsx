import { Plus, X, BookOpen, Swords, FileText, Wand2 } from "lucide-react";
import type { WidgetType } from "@/types";
import { CompendiumWidget } from "./widgets/CompendiumWidget";
import { InitiativeWidget } from "./widgets/InitiativeWidget";
import { NotepadWidget } from "./widgets/NotepadWidget";
import { OracleWidget } from "./widgets/OracleWidget";

interface Props {
  widget: WidgetType;
  onAdd: () => void;
  onClear: () => void;
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
};

function WidgetContent({ widget }: { widget: WidgetType }) {
  if (widget === "compendium") return <CompendiumWidget />;
  if (widget === "initiative") return <InitiativeWidget />;
  if (widget === "notepad") return <NotepadWidget />;
  if (widget === "oracle") return <OracleWidget />;
  return null;
}

export function DMTile({ widget, onAdd, onClear }: Props) {
  if (widget === "empty") {
    return (
      <div className="relative h-full rounded-lg border-2 border-dashed border-purple-900/50 hover:border-purple-600/70 transition-all group flex items-center justify-center bg-gray-950/40 hover:bg-purple-950/10">
        <button
          onClick={onAdd}
          className="flex flex-col items-center gap-2 text-purple-700 hover:text-purple-400 transition-colors"
        >
          <div className="w-10 h-10 rounded-full border-2 border-current flex items-center justify-center group-hover:shadow-[0_0_12px_rgba(139,43,226,0.4)] transition-all">
            <Plus className="w-5 h-5" />
          </div>
          <span className="text-xs opacity-60 group-hover:opacity-100">Add Widget</span>
        </button>
      </div>
    );
  }

  const meta = widgetMeta[widget];

  return (
    <div
      className={`relative h-full rounded-lg border bg-gray-950/80 ${meta.accent} hover:shadow-[0_0_16px_rgba(139,43,226,0.15)] transition-all flex flex-col overflow-hidden`}
      style={{
        backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='4' height='4'%3E%3Cpath d='M0 0h4v4H0z' fill='%23111' /%3E%3Cpath d='M0 0h1v1H0z' fill='%23161616' /%3E%3C/svg%3E\")",
      }}
    >
      {/* Tile header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-800/60 shrink-0">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-400">
          <span className="text-amber-500">{meta.icon}</span>
          {meta.label}
        </div>
        <button
          onClick={onClear}
          className="text-gray-700 hover:text-red-400 transition-colors"
          title="Clear tile"
        >
          <X className="w-3 h-3" />
        </button>
      </div>

      {/* Widget content */}
      <div className="flex-1 overflow-hidden p-3">
        <WidgetContent widget={widget} />
      </div>
    </div>
  );
}
