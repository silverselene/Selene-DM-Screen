import { useState, useMemo } from "react";
import { Search, Shield, Heart, Zap, ChevronDown, ChevronUp } from "lucide-react";
import { bestiaryData, mod, crToNumber, type Monster } from "@/data/bestiary";

const crColors: Record<string, string> = {
  "0": "text-gray-400", "1/8": "text-gray-400", "1/4": "text-green-400",
  "1/2": "text-green-400", "1": "text-green-300", "2": "text-yellow-400",
  "3": "text-yellow-400", "4": "text-orange-400", "5": "text-orange-400",
  "6": "text-orange-500", "7": "text-red-400", "8": "text-red-400",
  "9": "text-red-500", "10": "text-red-500", "11": "text-purple-400",
  "12": "text-purple-400", "13": "text-purple-500", "14": "text-purple-500",
  "15": "text-pink-400", "16": "text-pink-400", "17": "text-pink-500",
  "21": "text-pink-600", "30": "text-white",
};

function AbilityScore({ label, score }: { label: string; score: number }) {
  const m = mod(score);
  return (
    <div className="flex flex-col items-center bg-gray-900/60 rounded px-1.5 py-1 min-w-[32px]">
      <span className="text-[9px] text-gray-500 uppercase font-bold">{label}</span>
      <span className="text-xs font-bold text-gray-200">{score}</span>
      <span className={`text-[10px] font-semibold ${m.startsWith("+") ? "text-green-400" : "text-red-400"}`}>
        {m}
      </span>
    </div>
  );
}

function TraitSection({ title, items }: { title: string; items: { name: string; desc: string }[] }) {
  if (!items || items.length === 0) return null;
  return (
    <div className="mt-2">
      <div className="text-[10px] font-bold uppercase text-purple-400 tracking-wider mb-1 border-b border-purple-900/40 pb-0.5">
        {title}
      </div>
      <div className="space-y-1.5">
        {items.map((t, i) => (
          <div key={i} className="text-[10px] leading-relaxed text-gray-300">
            <span className="font-bold italic text-gray-100">{t.name}. </span>
            {t.desc}
          </div>
        ))}
      </div>
    </div>
  );
}

function StatBlock({ monster }: { monster: Monster }) {
  const crColor = crColors[monster.cr] || "text-gray-300";
  return (
    <div className="text-[10px] leading-relaxed">
      <div className="flex items-center justify-between flex-wrap gap-1 mb-2">
        <div>
          <span className="text-[10px] italic text-gray-400">
            {monster.size} {monster.type}, {monster.alignment}
          </span>
        </div>
        <span className={`text-xs font-bold ${crColor}`}>CR {monster.cr}</span>
      </div>

      <div className="flex gap-3 mb-2 flex-wrap text-[10px]">
        <div className="flex items-center gap-1">
          <Shield className="w-3 h-3 text-blue-400" />
          <span className="text-gray-300">AC {monster.ac}{monster.acType ? ` (${monster.acType})` : ""}</span>
        </div>
        <div className="flex items-center gap-1">
          <Heart className="w-3 h-3 text-red-400" />
          <span className="text-gray-300">{monster.hp} HP</span>
        </div>
        <div className="flex items-center gap-1">
          <Zap className="w-3 h-3 text-yellow-400" />
          <span className="text-gray-300">{monster.speed}</span>
        </div>
      </div>

      <div className="flex gap-1 mb-2 flex-wrap">
        <AbilityScore label="STR" score={monster.str} />
        <AbilityScore label="DEX" score={monster.dex} />
        <AbilityScore label="CON" score={monster.con} />
        <AbilityScore label="INT" score={monster.int} />
        <AbilityScore label="WIS" score={monster.wis} />
        <AbilityScore label="CHA" score={monster.cha} />
      </div>

      <div className="space-y-0.5 mb-2 text-[10px]">
        {monster.savingThrows && (
          <div><span className="text-gray-500 font-semibold">Saving Throws</span> <span className="text-gray-300">{monster.savingThrows}</span></div>
        )}
        {monster.skills && (
          <div><span className="text-gray-500 font-semibold">Skills</span> <span className="text-gray-300">{monster.skills}</span></div>
        )}
        {monster.damageImmunities && (
          <div><span className="text-gray-500 font-semibold">Damage Immunities</span> <span className="text-gray-300">{monster.damageImmunities}</span></div>
        )}
        {monster.damageResistances && (
          <div><span className="text-gray-500 font-semibold">Damage Resistances</span> <span className="text-gray-300">{monster.damageResistances}</span></div>
        )}
        {monster.damageVulnerabilities && (
          <div><span className="text-gray-500 font-semibold">Damage Vulnerabilities</span> <span className="text-gray-300">{monster.damageVulnerabilities}</span></div>
        )}
        {monster.conditionImmunities && (
          <div><span className="text-gray-500 font-semibold">Condition Immunities</span> <span className="text-gray-300">{monster.conditionImmunities}</span></div>
        )}
        <div><span className="text-gray-500 font-semibold">Senses</span> <span className="text-gray-300">{monster.senses}</span></div>
        <div><span className="text-gray-500 font-semibold">Languages</span> <span className="text-gray-300">{monster.languages}</span></div>
      </div>

      <TraitSection title="Traits" items={monster.traits || []} />
      <TraitSection title="Actions" items={monster.actions} />
      <TraitSection title="Reactions" items={monster.reactions || []} />
      <TraitSection title="Legendary Actions" items={monster.legendaryActions || []} />
    </div>
  );
}

type SortMode = "alpha" | "cr";

export function BestiaryWidget() {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Monster | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>("alpha");
  const [crFilter, setCrFilter] = useState("All");

  const crOptions = ["All", "0–1", "2–4", "5–10", "11–16", "17+"];

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return bestiaryData
      .filter((m) => {
        const matchQ = !q || m.name.toLowerCase().includes(q) || m.type.toLowerCase().includes(q);
        let matchCr = true;
        if (crFilter !== "All") {
          const n = crToNumber(m.cr);
          if (crFilter === "0–1") matchCr = n <= 1;
          else if (crFilter === "2–4") matchCr = n >= 2 && n <= 4;
          else if (crFilter === "5–10") matchCr = n >= 5 && n <= 10;
          else if (crFilter === "11–16") matchCr = n >= 11 && n <= 16;
          else if (crFilter === "17+") matchCr = n >= 17;
        }
        return matchQ && matchCr;
      })
      .sort((a, b) => {
        if (sortMode === "alpha") return a.name.localeCompare(b.name);
        return crToNumber(a.cr) - crToNumber(b.cr);
      });
  }, [query, sortMode, crFilter]);

  if (selected) {
    return (
      <div className="h-full flex flex-col">
        <button
          onClick={() => setSelected(null)}
          className="text-xs text-purple-400 hover:text-purple-300 mb-2 flex items-center gap-1 shrink-0"
        >
          ← Back to list
        </button>
        <div className="flex-1 overflow-y-auto">
          <div className="bg-gray-900/80 border border-red-900/40 rounded p-2.5">
            <h3 className="text-sm font-bold text-white mb-0.5">{selected.name}</h3>
            <StatBlock monster={selected} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col gap-1.5">
      <div className="flex gap-1.5 shrink-0">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-purple-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search monsters..."
            className="w-full pl-6 pr-2 py-1 bg-gray-900 border border-purple-800/50 rounded text-xs text-gray-200 placeholder-gray-500 focus:outline-none focus:border-purple-500"
          />
        </div>
        <select
          value={crFilter}
          onChange={(e) => setCrFilter(e.target.value)}
          className="text-xs bg-gray-900 border border-purple-800/50 rounded px-1.5 py-1 text-gray-300 focus:outline-none focus:border-purple-500"
        >
          {crOptions.map((o) => <option key={o}>{o}</option>)}
        </select>
        <button
          onClick={() => setSortMode((m) => m === "alpha" ? "cr" : "alpha")}
          className="flex items-center gap-0.5 text-xs px-2 py-1 bg-gray-800 hover:bg-gray-700 rounded text-gray-400 hover:text-gray-200 transition-colors shrink-0"
          title={`Sort by ${sortMode === "alpha" ? "CR" : "name"}`}
        >
          {sortMode === "alpha" ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />}
          {sortMode === "alpha" ? "A–Z" : "CR"}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto space-y-0.5">
        {filtered.length === 0 && (
          <div className="text-xs text-gray-600 text-center py-4">No monsters found</div>
        )}
        {filtered.map((m) => {
          const crColor = crColors[m.cr] || "text-gray-400";
          return (
            <button
              key={m.name}
              onClick={() => setSelected(m)}
              className="w-full text-left flex items-center justify-between px-2 py-1.5 bg-gray-900/60 hover:bg-red-950/30 border border-gray-800/60 hover:border-red-800/50 rounded transition-all group"
            >
              <div>
                <span className="text-xs font-semibold text-gray-200 group-hover:text-white">{m.name}</span>
                <span className="text-[10px] text-gray-500 ml-1.5 italic">{m.size} {m.type}</span>
              </div>
              <span className={`text-[10px] font-bold ${crColor} shrink-0 ml-2`}>CR {m.cr}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
