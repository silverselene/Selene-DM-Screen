import { useState, useMemo, useEffect, useDeferredValue } from "react";
import { Search, Shield, Heart, Zap, ChevronDown, ChevronUp, ExternalLink } from "lucide-react";
import { monsters, mod, crToNumber, type MonsterEntry } from "@/data/monsters";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import {
  BESTIARY_CR_FILTERS,
  BESTIARY_SORT_MODES,
  validateEnum,
  validateNullableStringMax,
  validateStringMax,
  WIDGET_QUERY_MAX,
} from "@/lib/backup";

// ── Unified display type ─────────────────────────────────────────────────────
// The widget reads the single monsters dataset (2,160 entries): a curated
// subset carries a full stat block (`actions` is defined), the rest are thin
// entries — name/AC/HP/CR/size/type/source. Thin entries render the header
// but the body falls back to "Full stat block not available" — same UX as
// the old DB fallback, just sourced locally.
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

function hasFullStatBlock(m: MonsterEntry): boolean {
  return m.actions !== undefined;
}

function toUnified(m: MonsterEntry): UnifiedMonster {
  return {
    name: m.name,
    size: m.size,
    type: m.type,
    alignment: m.alignment,
    ac: m.ac,
    acType: m.acType,
    hp: m.hp,
    speed: m.speed ?? "",
    str: m.str ?? 10, dex: m.dex ?? 10, con: m.con ?? 10,
    int: m.int ?? 10, wis: m.wis ?? 10, cha: m.cha ?? 10,
    savingThrows: m.savingThrows,
    skills: m.skills,
    damageImmunities: m.damageImmunities,
    damageResistances: m.damageResistances,
    damageVulnerabilities: m.damageVulnerabilities,
    conditionImmunities: m.conditionImmunities,
    senses: m.senses ?? "",
    languages: m.languages ?? "",
    cr: m.cr,
    traits: m.traits ?? [],
    actions: m.actions ?? [],
    reactions: m.reactions ?? [],
    legendaryActions: m.legendaryActions ?? [],
    source: m.source,
  };
}

// Lowercased-name → dataset entry, built once. Names are unique in the
// merged dataset, so no dedup pass is needed here.
const BY_NAME = new Map<string, MonsterEntry>(
  monsters.map(m => [m.name.toLowerCase(), m]),
);

// Total searchable monster count for the search placeholder — reads
// straight off the live dataset so it never drifts from the data.
const MONSTER_COUNT = monsters.length;

// Render caps — the result rows are not virtualized, so an uncapped broad
// match (1,000–2,300 entries now that most of the dataset carries a full stat
// block) would stall the main thread on every keystroke.
const MAX_RESULTS = 200;
const UNFILTERED_PREVIEW = 7;

function lookupByName(name: string): UnifiedMonster | null {
  const m = BY_NAME.get(name.toLowerCase());
  return m ? toUnified(m) : null;
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
    validateNullableStringMax(WIDGET_QUERY_MAX),
  );
  const [query, setQuery] = useLocalStorage<string>(
    "dm-bestiary-query-v1",
    "",
    validateStringMax(WIDGET_QUERY_MAX),
  );
  // The input stays driven by `query` (instant echo); the heavier filters over
  // the 2,160-row dataset run off the deferred value, so a fast typist doesn't
  // re-scan the whole dataset on every keystroke. Matches the debounce the
  // Initiative/Party search inputs already use.
  const deferredQuery = useDeferredValue(query);
  const [sortMode, setSortMode] = useLocalStorage<SortMode>(
    "dm-bestiary-sort-v1",
    "alpha",
    validateEnum(BESTIARY_SORT_MODES),
  );
  const [crFilter, setCrFilter] = useLocalStorage<string>(
    "dm-bestiary-cr-v1",
    "All",
    validateEnum(BESTIARY_CR_FILTERS),
  );

  // Resolve the persisted name back to a UnifiedMonster.
  const selected: UnifiedMonster | null = useMemo(
    () => (selectedName ? lookupByName(selectedName) : null),
    [selectedName],
  );
  const setSelected = (m: UnifiedMonster | null) => setSelectedName(m?.name ?? null);
  // Shared with the read/import validators in backup.ts so the allowlist
  // can't drift from the buttons rendered here.
  const crOptions = BESTIARY_CR_FILTERS;

  // ── When a target name arrives from Initiative Tracker ───────────────────
  // `target` is a one-shot signal. Consume it immediately (clear it back to
  // null in App) so re-opening the SAME monster from Initiative re-fires this
  // effect — otherwise a repeat dispatch sets an identical value, React bails
  // the state update, the effect never re-runs, and the click is a silent
  // no-op. The open monster is driven by the persisted `selectedName`, not by
  // `target`, so clearing the signal here does not close the detail view.
  useEffect(() => {
    if (!target) return;
    const match = lookupByName(target);
    if (match) {
      setSelected(match);
    } else {
      // No exact dataset match (custom-named combatant like "Goblin Boss
      // #2"). A silent no-op here looks like a dead click, so fall back to
      // searching the name: the DM lands on the near-matches list — or the
      // "No monsters found" empty state — instead of nothing happening.
      setSelected(null);
      setQuery(target);
    }
    onTargetClear?.();
  }, [target]);

  // ── Local list (curated full-stat-block subset) ──────────────────────────
  const localFiltered = useMemo(() => {
    const q = deferredQuery.toLowerCase();
    return monsters
      .filter(hasFullStatBlock)
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
  }, [deferredQuery, sortMode, crFilter]);

  // ── Broader thin-entry results when searching ────────────────────────────
  // Local filter over the ~2,120 thin entries; full-stat-block entries are
  // excluded (they already appear via localFiltered). Collection is capped at
  // MAX_RESULTS to keep the list short, but the scan runs the whole dataset so
  // `total` is the real match count — the footer's "of N" must be a total, not
  // a floor that silently stops counting at the cap.
  const { thinResults, thinTotal } = useMemo(() => {
    if (!deferredQuery.trim()) return { thinResults: [] as MonsterEntry[], thinTotal: 0 };
    const q = deferredQuery.toLowerCase();
    const hits: MonsterEntry[] = [];
    let total = 0;
    for (const m of monsters) {
      if (hasFullStatBlock(m)) continue;
      if (m.name.toLowerCase().includes(q) || m.type.toLowerCase().includes(q)) {
        total++;
        if (hits.length < MAX_RESULTS) hits.push(m);
      }
    }
    return { thinResults: hits, thinTotal: total };
  }, [deferredQuery]);

  // Merge rich + thin for display when searching, capped: a broad query (or a
  // CR filter alone) can match 1,000–2,300 of the full-stat-block pool, and the
  // rows are not virtualized — rendering them all stalls the main thread on
  // every keystroke. Slice the raw entries BEFORE toUnified so the cap also
  // bounds the object mapping, and keep the pre-cap total for the footer.
  const isFiltered = deferredQuery.trim() !== "" || crFilter !== "All";
  const { visibleList, totalResults } = useMemo((): { visibleList: UnifiedMonster[]; totalResults: number } => {
    const cap = isFiltered ? MAX_RESULTS : UNFILTERED_PREVIEW;
    const merged = deferredQuery.trim()
      ? [...localFiltered, ...thinResults].sort((a, b) =>
          sortMode === "alpha" ? a.name.localeCompare(b.name) : crCompare(a.cr, b.cr))
      : localFiltered;
    // thinResults is collection-capped; thinTotal carries the matches beyond
    // the cap so the footer total is real (thinTotal === thinResults.length
    // when nothing was cut).
    const total = merged.length + (thinTotal - thinResults.length);
    return { visibleList: merged.slice(0, cap).map(toUnified), totalResults: total };
  }, [isFiltered, deferredQuery, localFiltered, thinResults, thinTotal, sortMode]);

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
        {totalResults === 0 && (
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
        {!isFiltered && totalResults > UNFILTERED_PREVIEW && (
          <div className="text-center py-2 text-[10px] text-gray-600">
            Showing {UNFILTERED_PREVIEW} of {totalResults.toLocaleString()} — search to filter
          </div>
        )}
        {isFiltered && totalResults > MAX_RESULTS && (
          <div className="text-center py-2 text-[10px] text-gray-600">
            Showing first {MAX_RESULTS} of {totalResults.toLocaleString()} — refine your search
          </div>
        )}
      </div>
    </div>
  );
}
