import { useState, useMemo, useEffect } from "react";
import { Search, Shield, Heart, Zap, ChevronDown, ChevronUp, ExternalLink } from "lucide-react";
import { bestiaryData, mod, crToNumber, type Monster } from "@/data/bestiary";

// ── DB monster shape (snake_case from API) ───────────────────────────────────
interface DbMonster {
  id: number;
  name: string;
  size: string;
  type: string;
  alignment: string;
  ac: number;
  ac_type: string;
  hp: string;
  speed: string;
  str: number; dex: number; con: number; int_score: number; wis: number; cha: number;
  saving_throws?: string;
  skills?: string;
  damage_immunities?: string;
  damage_resistances?: string;
  damage_vulnerabilities?: string;
  condition_immunities?: string;
  senses: string;
  languages: string;
  cr: string;
  traits: { name: string; desc: string }[];
  actions: { name: string; desc: string }[];
  reactions: { name: string; desc: string }[];
  legendary_actions: { name: string; desc: string }[];
  source?: string;
  is_legendary?: boolean;
  initiative_modifier?: number;
}

// ── Unified display type ─────────────────────────────────────────────────────
interface UnifiedMonster {
  name: string;
  size: string;
  type: string;
  alignment: string;
  ac: number;
  acType: string;
  hp: string;
  speed: string;
  str: number; dex: number; con: number; int: number; wis: number; cha: number;
  savingThrows?: string;
  skills?: string;
  damageImmunities?: string;
  damageResistances?: string;
  damageVulnerabilities?: string;
  conditionImmunities?: string;
  senses: string;
  languages: string;
  cr: string;
  traits: { name: string; desc: string }[];
  actions: { name: string; desc: string }[];
  reactions: { name: string; desc: string }[];
  legendaryActions: { name: string; desc: string }[];
  source?: string;
}

function fromLocal(m: Monster): UnifiedMonster {
  return {
    ...m, acType: m.acType ?? "",
    traits: m.traits ?? [], reactions: m.reactions ?? [],
    legendaryActions: m.legendaryActions ?? [],
    source: "5e SRD",
  };
}

function fromDb(m: DbMonster): UnifiedMonster {
  return {
    name: m.name, size: m.size, type: m.type, alignment: m.alignment,
    ac: m.ac, acType: m.ac_type ?? "", hp: m.hp, speed: m.speed,
    str: m.str, dex: m.dex, con: m.con, int: m.int_score, wis: m.wis, cha: m.cha,
    savingThrows: m.saving_throws, skills: m.skills,
    damageImmunities: m.damage_immunities, damageResistances: m.damage_resistances,
    damageVulnerabilities: m.damage_vulnerabilities, conditionImmunities: m.condition_immunities,
    senses: m.senses, languages: m.languages, cr: m.cr,
    traits: m.traits ?? [], actions: m.actions ?? [],
    reactions: m.reactions ?? [], legendaryActions: m.legendary_actions ?? [],
    source: m.source,
  };
}

// ── CR colour ────────────────────────────────────────────────────────────────
function crColor(cr: string) {
  const n = crToNumber(cr);
  if (n === 0) return "text-gray-400";
  if (n <= 1) return "text-green-400";
  if (n <= 4) return "text-yellow-400";
  if (n <= 8) return "text-orange-400";
  if (n <= 12) return "text-red-400";
  if (n <= 16) return "text-purple-400";
  if (n <= 20) return "text-pink-400";
  return "text-white";
}

// ── Sub-components ───────────────────────────────────────────────────────────
function AbilityScore({ label, score }: { label: string; score: number }) {
  const m = mod(score);
  return (
    <div className="flex flex-col items-center bg-gray-900/60 rounded px-1.5 py-1 min-w-[32px]">
      <span className="text-[9px] text-gray-500 uppercase font-bold">{label}</span>
      <span className="text-xs font-bold text-gray-200">{score}</span>
      <span className={`text-[10px] font-semibold ${m.startsWith("+") ? "text-green-400" : "text-red-400"}`}>{m}</span>
    </div>
  );
}

function TraitSection({ title, items }: { title: string; items: { name: string; desc: string }[] }) {
  if (!items || items.length === 0) return null;
  return (
    <div className="mt-2">
      <div className="text-[10px] font-bold uppercase text-purple-400 tracking-wider mb-1 border-b border-purple-900/40 pb-0.5">{title}</div>
      <div className="space-y-1.5">
        {items.map((t, i) => (
          <div key={i} className="text-[10px] leading-relaxed text-gray-300">
            <span className="font-bold italic text-gray-100">{t.name}. </span>{t.desc}
          </div>
        ))}
      </div>
    </div>
  );
}

function StatBlock({ monster }: { monster: UnifiedMonster }) {
  const hasAbilities = monster.str !== 10 || monster.dex !== 10 || monster.con !== 10 || monster.int !== 10;
  const hasTraits = monster.traits.length > 0 || monster.actions.length > 0;

  return (
    <div className="text-[10px] leading-relaxed">
      <div className="flex items-center justify-between flex-wrap gap-1 mb-1.5">
        <span className="italic text-gray-400">{[monster.size, monster.type, monster.alignment].filter(Boolean).join(", ")}</span>
        <div className="flex items-center gap-1.5">
          {monster.source && <span className="text-[9px] text-gray-600 bg-gray-900/60 px-1 rounded">{monster.source}</span>}
          <span className={`text-xs font-bold ${crColor(monster.cr)}`}>CR {monster.cr}</span>
        </div>
      </div>

      <div className="flex gap-3 mb-2 flex-wrap">
        <div className="flex items-center gap-1">
          <Shield className="w-3 h-3 text-blue-400" />
          <span className="text-gray-300">AC {monster.ac}{monster.acType ? ` (${monster.acType})` : ""}</span>
        </div>
        <div className="flex items-center gap-1">
          <Heart className="w-3 h-3 text-red-400" />
          <span className="text-gray-300">{monster.hp} HP</span>
        </div>
        {monster.speed && (
          <div className="flex items-center gap-1">
            <Zap className="w-3 h-3 text-yellow-400" />
            <span className="text-gray-300">{monster.speed}</span>
          </div>
        )}
      </div>

      {hasAbilities && (
        <div className="flex gap-1 mb-2 flex-wrap">
          <AbilityScore label="STR" score={monster.str} />
          <AbilityScore label="DEX" score={monster.dex} />
          <AbilityScore label="CON" score={monster.con} />
          <AbilityScore label="INT" score={monster.int} />
          <AbilityScore label="WIS" score={monster.wis} />
          <AbilityScore label="CHA" score={monster.cha} />
        </div>
      )}

      <div className="space-y-0.5 mb-2">
        {monster.savingThrows && <div><span className="text-gray-500 font-semibold">Saving Throws </span><span className="text-gray-300">{monster.savingThrows}</span></div>}
        {monster.skills && <div><span className="text-gray-500 font-semibold">Skills </span><span className="text-gray-300">{monster.skills}</span></div>}
        {monster.damageImmunities && <div><span className="text-gray-500 font-semibold">Immunities </span><span className="text-gray-300">{monster.damageImmunities}</span></div>}
        {monster.damageResistances && <div><span className="text-gray-500 font-semibold">Resistances </span><span className="text-gray-300">{monster.damageResistances}</span></div>}
        {monster.damageVulnerabilities && <div><span className="text-gray-500 font-semibold">Vulnerabilities </span><span className="text-gray-300">{monster.damageVulnerabilities}</span></div>}
        {monster.conditionImmunities && <div><span className="text-gray-500 font-semibold">Condition Immunities </span><span className="text-gray-300">{monster.conditionImmunities}</span></div>}
        {monster.senses && <div><span className="text-gray-500 font-semibold">Senses </span><span className="text-gray-300">{monster.senses}</span></div>}
        {monster.languages && <div><span className="text-gray-500 font-semibold">Languages </span><span className="text-gray-300">{monster.languages}</span></div>}
      </div>

      {hasTraits ? (
        <>
          <TraitSection title="Traits" items={monster.traits} />
          <TraitSection title="Actions" items={monster.actions} />
          <TraitSection title="Reactions" items={monster.reactions} />
          <TraitSection title="Legendary Actions" items={monster.legendaryActions} />
        </>
      ) : (
        <p className="text-[10px] text-gray-600 italic mt-2">Full stat block not available for this monster.</p>
      )}
    </div>
  );
}

// ── Main widget ──────────────────────────────────────────────────────────────
interface Props {
  target?: string | null;
  onTargetClear?: () => void;
}

type SortMode = "alpha" | "cr";

export function BestiaryWidget({ target, onTargetClear }: Props) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<UnifiedMonster | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>("alpha");
  const [crFilter, setCrFilter] = useState("All");
  const [loadingTarget, setLoadingTarget] = useState(false);
  const crOptions = ["All", "0–1", "2–4", "5–10", "11–16", "17+"];

  // ── When a target name arrives from Initiative Tracker ───────────────────
  useEffect(() => {
    if (!target) return;
    setLoadingTarget(true);

    // Try API first (covers the full 2160-monster DB)
    fetch(`/api/monsters/search?q=${encodeURIComponent(target)}`)
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then((results: DbMonster[]) => {
        // Exact match preferred, otherwise first result
        const exact = results.find((m) => m.name.toLowerCase() === target.toLowerCase());
        const match = exact ?? results[0];
        if (match) { setSelected(fromDb(match)); return; }
        // Fall back to local SRD data
        const local = bestiaryData.find(
          (m) => m.name.toLowerCase() === target.toLowerCase()
        );
        if (local) setSelected(fromLocal(local));
      })
      .catch(() => {
        const local = bestiaryData.find(
          (m) => m.name.toLowerCase() === target.toLowerCase()
        );
        if (local) setSelected(fromLocal(local));
      })
      .finally(() => setLoadingTarget(false));
  }, [target]);

  // ── Local list (from the 40-monster SRD seed + DB search results) ────────
  const localFiltered = useMemo(() => {
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
      .sort((a, b) => sortMode === "alpha" ? a.name.localeCompare(b.name) : crToNumber(a.cr) - crToNumber(b.cr));
  }, [query, sortMode, crFilter]);

  // ── DB search results ────────────────────────────────────────────────────
  const [dbResults, setDbResults] = useState<DbMonster[]>([]);
  const [dbLoading, setDbLoading] = useState(false);
  useEffect(() => {
    if (!query.trim()) { setDbResults([]); return; }
    const t = setTimeout(() => {
      setDbLoading(true);
      fetch(`/api/monsters/search?q=${encodeURIComponent(query)}`)
        .then((r) => r.ok ? r.json() : Promise.resolve([]))
        .then(setDbResults)
        .catch(() => setDbResults([]))
        .finally(() => setDbLoading(false));
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  // Merge DB + local for display when searching
  const displayList: UnifiedMonster[] = useMemo(() => {
    if (!query.trim()) return localFiltered.map(fromLocal);
    const localNames = new Set(localFiltered.map((m) => m.name.toLowerCase()));
    const extra = dbResults
      .filter((m) => !localNames.has(m.name.toLowerCase()))
      .map(fromDb);
    return [...localFiltered.map(fromLocal), ...extra]
      .sort((a, b) => sortMode === "alpha" ? a.name.localeCompare(b.name) : crToNumber(a.cr) - crToNumber(b.cr));
  }, [query, localFiltered, dbResults, sortMode]);

  const handleBack = () => {
    setSelected(null);
    onTargetClear?.();
  };

  // ── Detail view ──────────────────────────────────────────────────────────
  if (loadingTarget) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-xs text-purple-400 animate-pulse">Loading monster…</p>
      </div>
    );
  }

  if (selected) {
    return (
      <div className="h-full min-h-0 flex flex-col">
        <button
          onClick={handleBack}
          className="text-xs text-purple-400 hover:text-purple-300 mb-2 flex items-center gap-1 shrink-0"
        >
          ← Back to list
        </button>
        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="bg-gray-900/80 border border-red-900/40 rounded p-2.5">
            <h3 className="text-sm font-bold text-white mb-1">{selected.name}</h3>
            <StatBlock monster={selected} />
          </div>
        </div>
      </div>
    );
  }

  // ── List view ────────────────────────────────────────────────────────────
  const isFiltered = query.trim() !== "" || crFilter !== "All";
  const visibleList = isFiltered ? displayList : displayList.slice(0, 15);

  return (
    <div className="h-full min-h-0 flex flex-col gap-1.5">
      <div className="flex gap-1.5 shrink-0">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-purple-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search 2,160 monsters…"
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

      <div className="flex-1 min-h-0 overflow-y-auto space-y-0.5">
        {displayList.length === 0 && !dbLoading && (
          <div className="text-xs text-gray-600 text-center py-4">No monsters found</div>
        )}
        {dbLoading && query && (
          <div className="text-xs text-purple-500 text-center py-1 animate-pulse">Searching database…</div>
        )}
        {visibleList.map((m) => (
          <button
            key={m.name}
            onClick={() => setSelected(m)}
            className="w-full text-left flex items-center justify-between px-2 py-1.5 bg-gray-900/60 hover:bg-red-950/30 border border-gray-800/60 hover:border-red-800/50 rounded transition-all group"
          >
            <div className="min-w-0">
              <span className="text-xs font-semibold text-gray-200 group-hover:text-white">{m.name}</span>
              <span className="text-[10px] text-gray-500 ml-1.5 italic">{[m.size, m.type].filter(Boolean).join(" ")}</span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0 ml-2">
              {m.source && <span className="text-[9px] text-gray-600">{m.source}</span>}
              <span className={`text-[10px] font-bold ${crColor(m.cr)}`}>CR {m.cr}</span>
            </div>
          </button>
        ))}
        {!isFiltered && displayList.length > 15 && (
          <div className="text-center py-2 text-[10px] text-gray-600">
            Showing 15 of {displayList.length} — search to filter
          </div>
        )}
      </div>
    </div>
  );
}
