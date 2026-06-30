import { useState, useMemo, useEffect } from "react";
import { Search, Shield, Heart, Zap, ChevronDown, ChevronUp, ExternalLink } from "lucide-react";
import { bestiaryData, mod, crToNumber, type Monster } from "@/data/bestiary";
import { monsterIndex, type MonsterIndexEntry } from "@/data/monsterIndex";
import { useLocalStorage } from "@/hooks/useLocalStorage";

// ── Unified display type ─────────────────────────────────────────────────────
// The widget combines two sources: bestiaryData (40 rich stat blocks) and
// monsterIndex (2,158 thin entries — name/AC/HP/CR/size/type/source). Thin
// entries render the header but the body falls back to "Full stat block not
// available" — same UX as the old DB fallback, just sourced locally.
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
    source: "5etools",
  };
}

function fromIndex(m: MonsterIndexEntry): UnifiedMonster {
  return {
    name: m.name, size: m.size, type: m.type, alignment: m.alignment,
    ac: m.ac, acType: "", hp: m.hp, speed: "",
    str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10,
    senses: "", languages: "", cr: m.cr,
    traits: [], actions: [], reactions: [], legendaryActions: [],
    source: m.source,
  };
}

// Lowercased-name → rich Monster lookup, built once.
const RICH_BY_NAME = new Map<string, Monster>(
  bestiaryData.map(m => [m.name.toLowerCase(), m]),
);

// Lowercased-name → first thin index hit, built once.
const THIN_BY_NAME = new Map<string, MonsterIndexEntry>();
for (const m of monsterIndex) {
  const key = m.name.toLowerCase();
  if (!THIN_BY_NAME.has(key)) THIN_BY_NAME.set(key, m);
}

// Count of distinct searchable monsters across both datasets (rich entries
// that also appear in the thin index aren't double-counted). Computed so the
// search placeholder never drifts from the data the way a hardcoded number
// does on every regen.
const MONSTER_COUNT = new Set<string>([
  ...RICH_BY_NAME.keys(),
  ...THIN_BY_NAME.keys(),
]).size;

function lookupByName(name: string): UnifiedMonster | null {
  const key = name.toLowerCase();
  const rich = RICH_BY_NAME.get(key);
  if (rich) return fromLocal(rich);
  const thin = THIN_BY_NAME.get(key);
  if (thin) return fromIndex(thin);
  return null;
}

// ── CR colour ────────────────────────────────────────────────────────────────
function crColor(cr: string) {
  const n = crToNumber(cr);
  if (!Number.isFinite(n)) return "text-gray-400"; // ungraded / unknown CR
  if (n === 0) return "text-gray-400";
  if (n <= 1) return "text-green-400";
  if (n <= 4) return "text-yellow-400";
  if (n <= 8) return "text-orange-400";
  if (n <= 12) return "text-red-400";
  if (n <= 16) return "text-purple-400";
  if (n <= 20) return "text-pink-400";
  return "text-white";
}

// Sort comparator by CR. Equal values (including two ungraded CRs, both
// POSITIVE_INFINITY) short-circuit to 0 so the subtraction can never produce
// NaN — an inconsistent comparator would otherwise leave such pairs in an
// undefined order. Current data has no ungraded CRs, but this keeps the sort
// well-defined if a future regen reintroduces one.
function crCompare(a: string, b: string): number {
  const na = crToNumber(a);
  const nb = crToNumber(b);
  return na === nb ? 0 : na - nb;
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

type StatBlockTab = "traits" | "actions" | "reactions" | "legendary";

const TAB_LABELS: Record<StatBlockTab, string> = {
  traits: "Traits",
  actions: "Actions",
  reactions: "Reactions",
  legendary: "Legendary",
};

function StatBlock({ monster }: { monster: UnifiedMonster }) {
  const hasAbilities = monster.str !== 10 || monster.dex !== 10 || monster.con !== 10 || monster.int !== 10;

  // Decide which tabs have content. Pick the first non-empty as default; reset
  // when the monster changes so jumping from Aboleth → Goblin starts at the
  // first tab that's actually populated for the new entry.
  const tabContent: Record<StatBlockTab, { name: string; desc: string }[]> = {
    traits: monster.traits,
    actions: monster.actions,
    reactions: monster.reactions,
    legendary: monster.legendaryActions,
  };
  const presentTabs = (Object.keys(tabContent) as StatBlockTab[]).filter(
    (k) => tabContent[k].length > 0,
  );
  const [activeTab, setActiveTab] = useState<StatBlockTab | null>(
    presentTabs[0] ?? null,
  );
  useEffect(() => {
    setActiveTab(presentTabs[0] ?? null);
    // Tab membership is fully determined by `monster`, so keying on its name
    // is enough.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monster.name]);

  return (
    // `flex-1 min-h-0` claims the remaining height inside the detail-view
    // card; `overflow-hidden` forces the column to honour its computed
    // height instead of stretching to the tab body's content.
    <div className="flex-1 min-h-0 overflow-hidden flex flex-col text-[10px] leading-relaxed">
      {/* ── Sticky header (always visible) ───────────────────────────────── */}
      <div className="shrink-0">
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
      </div>

      {/* ── Tab strip + scrollable tab body ──────────────────────────────── */}
      {presentTabs.length === 0 ? (
        <p className="text-[10px] text-gray-600 italic mt-2 shrink-0">Full stat block not available for this monster.</p>
      ) : (
        <>
          <div className="flex gap-0.5 border-b border-purple-900/40 shrink-0">
            {presentTabs.map((tab) => {
              const isActive = activeTab === tab;
              return (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  className={`px-2 py-1 text-[10px] font-semibold uppercase tracking-wider transition-colors border-b-2 -mb-[1px] ${
                    isActive
                      ? "text-purple-300 border-purple-400"
                      : "text-gray-500 border-transparent hover:text-purple-400"
                  }`}
                >
                  {TAB_LABELS[tab]}
                  <span className="ml-1 text-[9px] opacity-60">{tabContent[tab].length}</span>
                </button>
              );
            })}
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto pt-1.5">
            {activeTab && (
              <div className="space-y-1.5">
                {tabContent[activeTab].map((t, i) => (
                  <div key={i} className="text-[10px] leading-relaxed text-gray-300">
                    <span className="font-bold italic text-gray-100">{t.name}. </span>{t.desc}
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
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
  // Persist the open monster (by name) + view preferences so a tab reload
  // / server bounce drops the DM back exactly where they were. The selected
  // monster is stored as a name and resolved against the live datasets on
  // mount; that survives regenerations of the underlying data files.
  const [selectedName, setSelectedName] = useLocalStorage<string | null>(
    "dm-bestiary-selected-v1",
    null,
  );
  const [query, setQuery] = useLocalStorage<string>("dm-bestiary-query-v1", "");
  const [sortMode, setSortMode] = useLocalStorage<SortMode>(
    "dm-bestiary-sort-v1",
    "alpha",
  );
  const [crFilter, setCrFilter] = useLocalStorage<string>(
    "dm-bestiary-cr-v1",
    "All",
  );

  // Resolve the persisted name back to a UnifiedMonster.
  const selected: UnifiedMonster | null = useMemo(
    () => (selectedName ? lookupByName(selectedName) : null),
    [selectedName],
  );
  const setSelected = (m: UnifiedMonster | null) => setSelectedName(m?.name ?? null);
  const crOptions = ["All", "0–1", "2–4", "5–10", "11–16", "17+"];

  // ── When a target name arrives from Initiative Tracker ───────────────────
  useEffect(() => {
    if (!target) return;
    const match = lookupByName(target);
    if (match) setSelected(match);
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
      .sort((a, b) => sortMode === "alpha" ? a.name.localeCompare(b.name) : crCompare(a.cr, b.cr));
  }, [query, sortMode, crFilter]);

  // ── Broader thin-index results when searching ────────────────────────────
  // Local filter over the 2,158-row monsterIndex; rich entries are excluded
  // (they already appear via localFiltered). Capped to keep the list short.
  const thinResults = useMemo(() => {
    if (!query.trim()) return [] as MonsterIndexEntry[];
    const q = query.toLowerCase();
    const richNames = new Set(bestiaryData.map(m => m.name.toLowerCase()));
    const hits: MonsterIndexEntry[] = [];
    for (const m of monsterIndex) {
      if (richNames.has(m.name.toLowerCase())) continue;
      if (m.name.toLowerCase().includes(q) || m.type.toLowerCase().includes(q)) {
        hits.push(m);
        if (hits.length >= 200) break;
      }
    }
    return hits;
  }, [query]);

  // Merge rich + thin for display when searching.
  const displayList: UnifiedMonster[] = useMemo(() => {
    if (!query.trim()) return localFiltered.map(fromLocal);
    return [...localFiltered.map(fromLocal), ...thinResults.map(fromIndex)]
      .sort((a, b) => sortMode === "alpha" ? a.name.localeCompare(b.name) : crCompare(a.cr, b.cr));
  }, [query, localFiltered, thinResults, sortMode]);

  const handleBack = () => {
    setSelected(null);
    onTargetClear?.();
  };

  // ── Detail view ──────────────────────────────────────────────────────────
  if (selected) {
    return (
      <div className="h-full min-h-0 flex flex-col">
        <button
          onClick={handleBack}
          className="text-xs text-purple-400 hover:text-purple-300 mb-2 flex items-center gap-1 shrink-0"
        >
          ← Back to list
        </button>
        <div className="flex-1 min-h-0 overflow-hidden flex flex-col bg-gray-900/80 border border-red-900/40 rounded p-2.5">
          <h3 className="text-sm font-bold text-white mb-1 shrink-0">{selected.name}</h3>
          <StatBlock monster={selected} />
        </div>
      </div>
    );
  }

  // ── List view ────────────────────────────────────────────────────────────
  const isFiltered = query.trim() !== "" || crFilter !== "All";
  const visibleList = isFiltered ? displayList : displayList.slice(0, 7);

  return (
    <div className="h-full min-h-0 flex flex-col gap-1.5">
      <div className="flex gap-1.5 shrink-0">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-purple-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search ${MONSTER_COUNT.toLocaleString()} monsters…`}
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
        {displayList.length === 0 && (
          <div className="text-xs text-gray-600 text-center py-4">No monsters found</div>
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
        {!isFiltered && displayList.length > 7 && (
          <div className="text-center py-2 text-[10px] text-gray-600">
            Showing 7 of {displayList.length} — search to filter
          </div>
        )}
      </div>
    </div>
  );
}
