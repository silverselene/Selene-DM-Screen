import { useDeferredValue, useMemo } from "react";
import { Search, BookMarked, ChevronLeft } from "lucide-react";
import { spellData, spellSchools, spellClasses, type Spell } from "@/data/spells";
import { Combobox } from "@/lib/Combobox";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import {
  validateBoundedInt,
  validateNullableStringMax,
  validateStringMax,
  WIDGET_QUERY_MAX,
} from "@/lib/backup";

const levelLabels = ["Cantrip", "1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th"];

// Precomputed lowercased name+description per spell, built once at module load.
// The free-text filter runs on every keystroke; lowercasing all 557 spell
// descriptions each time was the only non-trivial allocation in the path.
const SPELL_SEARCH_INDEX = new Map<Spell, string>(
  spellData.map((s) => [s, `${s.name}\n${s.description}`.toLowerCase()]),
);

const schoolColors: Record<string, string> = {
  Abjuration: "text-blue-400",
  Conjuration: "text-yellow-400",
  Divination: "text-cyan-400",
  Enchantment: "text-pink-400",
  Evocation: "text-orange-400",
  Illusion: "text-purple-400",
  Necromancy: "text-green-400",
  Transmutation: "text-amber-400",
};

function SpellDetail({ spell, onBack }: { spell: Spell; onBack: () => void }) {
  return (
    <div className="h-full min-h-0 flex flex-col">
      <button
        onClick={onBack}
        className="flex items-center gap-1 text-xs text-cyan-400 hover:text-cyan-300 mb-2 shrink-0"
      >
        <ChevronLeft className="w-3 h-3" /> Back
      </button>
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="bg-gray-900/80 border border-cyan-900/40 rounded p-3 space-y-2">
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <h3 className="text-sm font-bold text-white">{spell.name}</h3>
            <div className="flex gap-1.5 flex-wrap">
              {spell.ritual && (
                <span className="text-[10px] px-1.5 py-0.5 bg-yellow-900/40 text-yellow-400 border border-yellow-800/40 rounded">Ritual</span>
              )}
              {spell.concentration && (
                <span className="text-[10px] px-1.5 py-0.5 bg-blue-900/40 text-blue-400 border border-blue-800/40 rounded">Conc.</span>
              )}
            </div>
          </div>

          <div className="text-xs italic text-gray-400">
            {spell.level === 0 ? "Cantrip" : `${levelLabels[spell.level]}-Level`} {spell.school}
          </div>

          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
            <div><span className="text-gray-500 font-semibold">Casting Time: </span><span className="text-gray-300">{spell.castingTime}</span></div>
            <div><span className="text-gray-500 font-semibold">Range: </span><span className="text-gray-300">{spell.range}</span></div>
            <div><span className="text-gray-500 font-semibold">Components: </span><span className="text-gray-300">{spell.components}</span></div>
            <div><span className="text-gray-500 font-semibold">Duration: </span><span className="text-gray-300">{spell.duration}</span></div>
          </div>

          <div className="border-t border-gray-800 pt-2">
            <p className="text-xs text-gray-300 leading-relaxed">{spell.description}</p>
          </div>

          {spell.upcast && (
            <div className="bg-cyan-950/30 border border-cyan-900/40 rounded p-2">
              <span className="text-[10px] font-bold text-cyan-400 uppercase tracking-wide">At Higher Levels: </span>
              <span className="text-[10px] text-gray-300">{spell.upcast}</span>
            </div>
          )}

          <div className="flex flex-wrap gap-1 pt-1">
            {spell.classes.map((c) => (
              <span key={c} className="text-[10px] px-1.5 py-0.5 bg-gray-800 text-gray-400 rounded">{c}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function WizardsTomeWidget() {
  // Persisted state. The selected spell is stored by name and re-resolved
  // against the live dataset on mount, so regenerating spells.ts later
  // doesn't strand a stale entry.
  const [query, setQuery] = useLocalStorage<string>(
    "dm-tome-query-v1",
    "",
    validateStringMax(WIDGET_QUERY_MAX),
  );
  const [filterLevel, setFilterLevel] = useLocalStorage<number>(
    "dm-tome-level-v1",
    -1,
    validateBoundedInt(-1, 9), // -1 = "all levels"
  );
  // "" = no filter; non-empty = the picked class/school name.
  const [filterClass, setFilterClass] = useLocalStorage<string>(
    "dm-tome-class-v1",
    "",
    validateStringMax(WIDGET_QUERY_MAX),
  );
  const [filterSchool, setFilterSchool] = useLocalStorage<string>(
    "dm-tome-school-v1",
    "",
    validateStringMax(WIDGET_QUERY_MAX),
  );
  const [selectedName, setSelectedName] = useLocalStorage<string | null>(
    "dm-tome-selected-v1",
    null,
    validateNullableStringMax(WIDGET_QUERY_MAX),
  );
  const selected: Spell | null = useMemo(
    () =>
      selectedName
        ? spellData.find((s) => s.name === selectedName) ?? null
        : null,
    [selectedName],
  );
  const setSelected = (s: Spell | null) => setSelectedName(s?.name ?? null);

  // The input stays driven by `query` (instant echo); the scan + sort runs
  // off the deferred value. This is the largest per-keystroke search in the
  // app by bytes scanned (~0.5 MB of precomputed name+description text), so
  // it gets the same `useDeferredValue` treatment as the Bestiary's
  // 2,158-row index filter.
  const deferredQuery = useDeferredValue(query);
  const filtered = useMemo(() => {
    const q = deferredQuery.toLowerCase();
    return spellData
      .filter((s) => {
        const matchQ = !q || (SPELL_SEARCH_INDEX.get(s)?.includes(q) ?? false);
        const matchLv = filterLevel < 0 || s.level === filterLevel;
        const matchCl = !filterClass || s.classes.includes(filterClass);
        const matchSch = !filterSchool || s.school === filterSchool;
        return matchQ && matchLv && matchCl && matchSch;
      })
      .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
  }, [deferredQuery, filterLevel, filterClass, filterSchool]);

  if (selected) return <SpellDetail spell={selected} onBack={() => setSelected(null)} />;

  const isFiltered = query.trim() !== "" || filterLevel !== -1 || filterClass !== "" || filterSchool !== "";
  const visibleSpells = isFiltered ? filtered : filtered.slice(0, 7);

  return (
    <div className="h-full min-h-0 flex flex-col gap-1.5">
      {/* Search */}
      <div className="relative shrink-0">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-cyan-500" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search spells…"
          className="w-full pl-6 pr-2 py-1 bg-gray-900 border border-cyan-900/50 rounded text-xs text-gray-200 placeholder-gray-500 focus:outline-none focus:border-cyan-600"
        />
      </div>

      {/* Filters */}
      <div className="flex gap-1 shrink-0 flex-wrap">
        <select
          value={filterLevel}
          onChange={(e) => setFilterLevel(Number(e.target.value))}
          className="text-xs bg-gray-900 border border-cyan-900/50 rounded px-1.5 py-1 text-gray-300 focus:outline-none focus:border-cyan-600 flex-1 min-w-0"
        >
          <option value={-1}>All Levels</option>
          {levelLabels.map((l, i) => (
            <option key={i} value={i}>{l}</option>
          ))}
        </select>
        <Combobox
          value={filterClass}
          onChange={setFilterClass}
          options={spellClasses}
          placeholder="All Classes"
          ariaLabel="Filter spells by class"
          allowCustom={false}
          className="flex-1 min-w-0"
        />
        <Combobox
          value={filterSchool}
          onChange={setFilterSchool}
          options={spellSchools}
          placeholder="All Schools"
          ariaLabel="Filter spells by school"
          allowCustom={false}
          className="flex-1 min-w-0"
        />
      </div>

      {/* Result count */}
      <div className="flex items-center justify-between shrink-0">
        <span className="text-[10px] text-gray-600">{filtered.length} spell{filtered.length !== 1 ? "s" : ""}</span>
        <div className="flex gap-0.5">
          <span className="text-[10px] px-1 py-0.5 bg-blue-900/30 text-blue-400 rounded">C=Conc.</span>
          <span className="text-[10px] px-1 py-0.5 bg-yellow-900/30 text-yellow-400 rounded">R=Ritual</span>
        </div>
      </div>

      {/* Spell list */}
      <div className="flex-1 min-h-0 overflow-y-auto space-y-0.5">
        {filtered.length === 0 && (
          <div className="text-center py-4 text-gray-600 text-xs flex flex-col items-center gap-2">
            <BookMarked className="w-6 h-6 opacity-30" />
            No spells found
          </div>
        )}
        {visibleSpells.map((s) => {
          const schoolColor = schoolColors[s.school] || "text-gray-400";
          return (
            <button
              key={`${s.name}-${s.level}`}
              onClick={() => setSelected(s)}
              className="w-full text-left flex items-center gap-2 px-2 py-1.5 bg-gray-900/50 hover:bg-cyan-950/30 border border-gray-800/50 hover:border-cyan-800/50 rounded transition-all group"
            >
              <span className="text-[10px] font-bold text-gray-600 w-5 text-center shrink-0">
                {s.level === 0 ? "C" : s.level}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-medium text-gray-200 group-hover:text-white truncate">{s.name}</span>
                  {s.concentration && <span className="text-[9px] text-blue-500 shrink-0">●C</span>}
                  {s.ritual && <span className="text-[9px] text-yellow-500 shrink-0">●R</span>}
                </div>
              </div>
              <span className={`text-[10px] shrink-0 ${schoolColor}`}>{s.school.slice(0, 4)}</span>
            </button>
          );
        })}
        {!isFiltered && filtered.length > 7 && (
          <div className="text-center py-2 text-[10px] text-gray-600">
            Showing 7 of {filtered.length} — search to filter
          </div>
        )}
      </div>
    </div>
  );
}
