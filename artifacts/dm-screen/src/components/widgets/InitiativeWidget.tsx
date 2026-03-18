import { useState } from "react";
import { Plus, Trash2, ChevronDown, ChevronUp, Swords, SkipForward, RotateCcw } from "lucide-react";
import type { Combatant } from "@/types";
import { useLocalStorage } from "@/hooks/useLocalStorage";

let idCounter = Date.now();
const nextId = () => String(++idCounter);

export function InitiativeWidget() {
  const [combatants, setCombatants] = useLocalStorage<Combatant[]>("dm-initiative", []);
  const [currentIndex, setCurrentIndex] = useLocalStorage<number>("dm-initiative-turn", 0);
  const [form, setForm] = useState({ name: "", initiative: "", hp: "", isPlayer: false });
  const [showForm, setShowForm] = useState(false);
  const [round, setRound] = useLocalStorage<number>("dm-round", 1);

  const sorted = [...combatants].sort((a, b) => b.initiative - a.initiative);

  const addCombatant = () => {
    if (!form.name.trim()) return;
    const newCombatant: Combatant = {
      id: nextId(),
      name: form.name.trim(),
      initiative: parseInt(form.initiative) || 0,
      hp: parseInt(form.hp) || 0,
      maxHp: parseInt(form.hp) || 0,
      isPlayer: form.isPlayer,
    };
    const next = [...combatants, newCombatant].sort((a, b) => b.initiative - a.initiative);
    setCombatants(next);
    setForm({ name: "", initiative: "", hp: "", isPlayer: false });
    setShowForm(false);
  };

  const removeCombatant = (id: string) => {
    const next = combatants.filter((c) => c.id !== id);
    setCombatants(next.sort((a, b) => b.initiative - a.initiative));
    if (currentIndex >= next.length && next.length > 0) setCurrentIndex(next.length - 1);
  };

  const updateHp = (id: string, delta: number) => {
    setCombatants(combatants.map((c) =>
      c.id === id ? { ...c, hp: Math.max(0, c.hp + delta) } : c
    ));
  };

  const nextTurn = () => {
    if (sorted.length === 0) return;
    const next = (currentIndex + 1) % sorted.length;
    if (next === 0) setRound((r) => r + 1);
    setCurrentIndex(next);
  };

  const reset = () => {
    setCombatants([]);
    setCurrentIndex(0);
    setRound(1);
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-xs text-purple-400">Round</span>
          <span className="text-sm font-bold text-amber-400">{round}</span>
        </div>
        <div className="flex gap-1">
          <button
            onClick={nextTurn}
            disabled={sorted.length === 0}
            className="flex items-center gap-1 text-xs px-2 py-1 bg-purple-800/50 hover:bg-purple-700/60 disabled:opacity-40 rounded transition-colors text-purple-200"
          >
            <SkipForward className="w-3 h-3" />
            Next
          </button>
          <button
            onClick={() => setShowForm((v) => !v)}
            className="flex items-center gap-1 text-xs px-2 py-1 bg-gray-700/60 hover:bg-gray-600/60 rounded transition-colors text-gray-300"
          >
            <Plus className="w-3 h-3" />
          </button>
          <button
            onClick={reset}
            className="flex items-center gap-1 text-xs px-2 py-1 bg-red-900/40 hover:bg-red-800/50 rounded transition-colors text-red-400"
          >
            <RotateCcw className="w-3 h-3" />
          </button>
        </div>
      </div>

      {showForm && (
        <div className="mb-2 p-2 bg-gray-900/80 border border-purple-700/40 rounded space-y-1.5">
          <input
            placeholder="Name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="w-full px-2 py-1 bg-gray-800 border border-gray-600 rounded text-xs text-gray-200 placeholder-gray-500 focus:outline-none focus:border-purple-500"
          />
          <div className="flex gap-1">
            <input
              placeholder="Initiative"
              type="number"
              value={form.initiative}
              onChange={(e) => setForm({ ...form, initiative: e.target.value })}
              className="w-1/2 px-2 py-1 bg-gray-800 border border-gray-600 rounded text-xs text-gray-200 placeholder-gray-500 focus:outline-none focus:border-purple-500"
            />
            <input
              placeholder="HP"
              type="number"
              value={form.hp}
              onChange={(e) => setForm({ ...form, hp: e.target.value })}
              className="w-1/2 px-2 py-1 bg-gray-800 border border-gray-600 rounded text-xs text-gray-200 placeholder-gray-500 focus:outline-none focus:border-purple-500"
            />
          </div>
          <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer">
            <input
              type="checkbox"
              checked={form.isPlayer}
              onChange={(e) => setForm({ ...form, isPlayer: e.target.checked })}
              className="accent-purple-500"
            />
            Player Character
          </label>
          <button
            onClick={addCombatant}
            className="w-full py-1 bg-purple-700 hover:bg-purple-600 rounded text-xs text-white font-semibold transition-colors"
          >
            Add to Initiative
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto space-y-1">
        {sorted.length === 0 && (
          <div className="text-center py-4 text-gray-500 text-xs flex flex-col items-center gap-2">
            <Swords className="w-6 h-6 opacity-30" />
            No combatants yet
          </div>
        )}
        {sorted.map((c, i) => {
          const isActive = i === currentIndex;
          const isDead = c.hp === 0;
          return (
            <div
              key={c.id}
              className={`flex items-center gap-2 px-2 py-1.5 rounded border transition-all ${
                isActive
                  ? "bg-purple-900/60 border-purple-500 shadow-[0_0_8px_rgba(139,92,246,0.4)]"
                  : "bg-gray-900/60 border-gray-700/50 hover:border-purple-800/50"
              } ${isDead ? "opacity-50" : ""}`}
            >
              <span className={`text-xs font-bold w-5 text-center ${isActive ? "text-amber-400" : "text-gray-500"}`}>
                {c.initiative}
              </span>
              <div className="flex-1 min-w-0">
                <div className={`text-xs font-semibold truncate ${c.isPlayer ? "text-green-400" : "text-gray-200"}`}>
                  {isActive && "▶ "}{c.name}
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => updateHp(c.id, -1)} className="w-4 h-4 flex items-center justify-center bg-red-900/60 hover:bg-red-800 rounded text-xs text-red-300">
                  <ChevronDown className="w-3 h-3" />
                </button>
                <span className={`text-xs font-mono w-12 text-center ${isDead ? "text-red-500 font-bold" : "text-gray-300"}`}>
                  {isDead ? "DEAD" : `${c.hp}/${c.maxHp}`}
                </span>
                <button onClick={() => updateHp(c.id, 1)} className="w-4 h-4 flex items-center justify-center bg-green-900/60 hover:bg-green-800 rounded text-xs text-green-300">
                  <ChevronUp className="w-3 h-3" />
                </button>
              </div>
              <button onClick={() => removeCombatant(c.id)} className="w-4 h-4 flex items-center justify-center text-gray-600 hover:text-red-400 transition-colors">
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
