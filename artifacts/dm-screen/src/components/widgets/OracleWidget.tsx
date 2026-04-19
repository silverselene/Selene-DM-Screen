import { useState } from "react";
import { Wand2, RefreshCw, User, Gem, Sword } from "lucide-react";
import { generateName, generateLoot, generateItem, namesByRace, lootByCR } from "@/data/generators";

type OracleTab = "names" | "loot" | "items";

export function OracleWidget() {
  const [tab, setTab] = useState<OracleTab>("names");
  const [result, setResult] = useState<string>("");
  const [selectedRace, setSelectedRace] = useState("Human");
  const [selectedCR, setSelectedCR] = useState("CR 0-4");
  const [history, setHistory] = useState<string[]>([]);

  const generate = () => {
    let res = "";
    if (tab === "names") res = generateName(selectedRace);
    else if (tab === "loot") res = generateLoot(selectedCR);
    else res = generateItem();
    setResult(res);
    setHistory((h) => [res, ...h.slice(0, 4)]);
  };

  const tabs: { id: OracleTab; label: string; icon: React.ReactNode }[] = [
    { id: "names", label: "Names", icon: <User className="w-3 h-3" /> },
    { id: "loot", label: "Loot", icon: <Gem className="w-3 h-3" /> },
    { id: "items", label: "Items", icon: <Sword className="w-3 h-3" /> },
  ];

  return (
    <div className="h-full min-h-0 flex flex-col">
      <div className="flex gap-1 mb-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => { setTab(t.id); setResult(""); }}
            className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-semibold transition-all ${
              tab === t.id
                ? "bg-purple-700 text-white shadow-[0_0_6px_rgba(139,43,226,0.4)]"
                : "bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200"
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      <div className="mb-3">
        {tab === "names" && (
          <select
            value={selectedRace}
            onChange={(e) => setSelectedRace(e.target.value)}
            className="w-full text-xs bg-gray-900 border border-purple-800/50 rounded px-2 py-1.5 text-gray-300 focus:outline-none focus:border-purple-500"
          >
            {Object.keys(namesByRace).map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        )}
        {tab === "loot" && (
          <select
            value={selectedCR}
            onChange={(e) => setSelectedCR(e.target.value)}
            className="w-full text-xs bg-gray-900 border border-purple-800/50 rounded px-2 py-1.5 text-gray-300 focus:outline-none focus:border-purple-500"
          >
            {Object.keys(lootByCR).map((cr) => (
              <option key={cr}>{cr}</option>
            ))}
          </select>
        )}
        {tab === "items" && (
          <div className="text-xs text-gray-500 italic px-1">
            Generates mundane items or common magic items at random.
          </div>
        )}
      </div>

      <button
        onClick={generate}
        className="flex items-center justify-center gap-2 w-full py-2 bg-gradient-to-r from-purple-800 to-purple-600 hover:from-purple-700 hover:to-purple-500 rounded text-white text-xs font-bold transition-all shadow-[0_0_10px_rgba(139,43,226,0.3)] hover:shadow-[0_0_14px_rgba(139,43,226,0.5)]"
      >
        <Wand2 className="w-4 h-4" />
        Generate
        <RefreshCw className="w-3 h-3 opacity-60" />
      </button>

      {result && (
        <div className="mt-3 p-3 bg-gray-900/80 border border-white/20 rounded">
          <div className="text-sm text-white font-semibold leading-relaxed">{result}</div>
        </div>
      )}

      {history.length > 1 && (
        <div className="mt-3 flex-1 min-h-0 overflow-y-auto">
          <div className="text-xs text-gray-600 mb-1">Previous Results</div>
          <div className="space-y-1">
            {history.slice(1).map((h, i) => (
              <div key={i} className="text-xs text-gray-500 px-2 py-1 bg-gray-900/40 rounded border border-gray-800">
                {h}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
