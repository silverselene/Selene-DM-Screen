import { X, BookOpen, Swords, FileText, Wand2, Skull, BookMarked } from "lucide-react";
import type { WidgetType } from "@/types";

interface Props {
  onSelect: (widget: WidgetType) => void;
  onClose: () => void;
}

const widgets: { type: WidgetType; label: string; description: string; icon: React.ReactNode; color: string }[] = [
  {
    type: "compendium",
    label: "5.5e Compendium",
    description: "2024 rules: Weapon Masteries, conditions, combat, feats & more.",
    icon: <BookOpen className="w-6 h-6" />,
    color: "from-blue-900/60 to-blue-800/40 border-blue-600/50 hover:border-blue-400",
  },
  {
    type: "initiative",
    label: "Initiative Tracker",
    description: "Track combatants, HP, and turn order.",
    icon: <Swords className="w-6 h-6" />,
    color: "from-red-900/60 to-red-800/40 border-red-600/50 hover:border-red-400",
  },
  {
    type: "notepad",
    label: "Session Notepad",
    description: "Auto-saving scratch pad for session notes.",
    icon: <FileText className="w-6 h-6" />,
    color: "from-green-900/60 to-green-800/40 border-green-600/50 hover:border-green-400",
  },
  {
    type: "oracle",
    label: "The Oracle",
    description: "Generate names, loot, and random magic items.",
    icon: <Wand2 className="w-6 h-6" />,
    color: "from-purple-900/60 to-purple-800/40 border-purple-600/50 hover:border-purple-400",
  },
  {
    type: "bestiary",
    label: "Bestiary",
    description: "Full stat blocks for 70+ monsters, searchable.",
    icon: <Skull className="w-6 h-6" />,
    color: "from-rose-900/60 to-rose-800/40 border-rose-600/50 hover:border-rose-400",
  },
  {
    type: "wizard-tome",
    label: "Wizard's Tome",
    description: "All D&D 5e spells levels 0–9, filterable by class & school.",
    icon: <BookMarked className="w-6 h-6" />,
    color: "from-cyan-900/60 to-cyan-800/40 border-cyan-600/50 hover:border-cyan-400",
  },
];

export function WidgetSelectorModal({ onSelect, onClose }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 border border-purple-700/60 rounded-xl p-6 w-full max-w-lg shadow-[0_0_40px_rgba(139,43,226,0.3)]" style={{ background: "var(--dm-bg-card)" }}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold tracking-wide" style={{ color: "var(--dm-thead)" }}>Choose a Widget</h2>
          <button onClick={onClose} className="hover:text-gray-200 transition-colors" style={{ color: "var(--dm-t3)" }}>
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {widgets.map((w) => (
            <button
              key={w.type}
              onClick={() => onSelect(w.type)}
              className={`flex flex-col items-center gap-2 p-4 bg-gradient-to-br ${w.color} border rounded-lg transition-all hover:scale-105 hover:shadow-[0_0_12px_rgba(139,43,226,0.3)] text-center`}
            >
              <div className="text-white/80">{w.icon}</div>
              <div className="text-sm font-bold text-gray-100">{w.label}</div>
              <div className="text-xs text-gray-400 leading-tight">{w.description}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
