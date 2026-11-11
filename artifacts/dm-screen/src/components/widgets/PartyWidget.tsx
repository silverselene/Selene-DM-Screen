import { useState, useEffect, useMemo, useRef } from "react";
import {
  Users, Plus, Trash2, Pencil, Check, X, Swords, Shield,
  Heart, Star, BookOpen, Sword, Download, Upload, CloudDownload,
  CircleCheck, Circle, ChevronUp, ChevronDown, MoveHorizontal,
} from "lucide-react";
import { ABILITY_KEYS, type AbilityScores, type PlayerCharacter, type Combatant } from "@/types";
import { ABILITY_LABELS } from "@/lib/abilities";
import { weaponsData, type Weapon } from "@/data/weapons";
import { UNARMED_STRIKE, withUnarmedStrike } from "@/data/unarmedStrike";
import { spellData, type Spell } from "@/data/spells";
import {
  addCharacter,
  deleteCharacter,
  exportPartyAsJson,
  preparePartyImport,
  updateCharacter,
  useParty,
} from "@/lib/partyStore";
import {
  downloadJsonFile,
  mintCombatantId,
  promptForJsonFile,
  validatePartyCollapsed,
} from "@/lib/backup";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import {
  addCombatantToInitiative,
  clampInitiative,
  confirmDuplicateViaWindow,
  initiativeFullMessage,
} from "@/lib/combatant";
import { AnchoredDropdown } from "@/lib/AnchoredDropdown";
import { Combobox } from "@/lib/Combobox";
import { isImeComposing } from "@/lib/keyboard";
import { PLAYER_CLASSES, PLAYER_RACES } from "@/data/playerOptions";
import { CharacterSheetModal } from "./CharacterSheetModal";
import { weaponDistanceShort, weaponRange } from "@/lib/weaponRange";
import {
  isPrepared,
  preparedAfterAdding,
  splitSpells,
  togglePrepared,
} from "@/lib/preparedSpells";
import { DdbImportPanel } from "./DdbImportPanel";
import {
  ddbCharacterSheetUrl,
  normalizeDdbUrl,
  type DdbImportResult,
} from "@/lib/ddbImport";

// ── Weapon summary used by the tag-input and pill components ─────────────
type WeaponInfo = Pick<
  Weapon,
  "id" | "name" | "category" | "damage" | "damage_type" | "properties" | "cost" | "weight" | "mastery" | "kind"
>;

// ── Weapon tag-input component ─────────────────────────────────────────────
function WeaponTagInput({
  selected,
  onChange,
}: {
  selected: string[];
  onChange: (names: string[]) => void;
}) {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<WeaponInfo[]>([]);
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (!query.trim()) { setSuggestions([]); setOpen(false); return; }
    // Tiny debounce so each keystroke doesn't churn React; the actual filter
    // is cheap (251 weapons) and runs synchronously.
    timer.current = setTimeout(() => {
      const q = query.trim().toLowerCase();
      const selectedLower = new Set(selected.map(s => s.toLowerCase()));
      const matches = weaponsData
        .filter(w => w.name.toLowerCase().includes(q) && !selectedLower.has(w.name.toLowerCase()))
        .sort((a, b) => {
          const ap = a.name.toLowerCase().startsWith(q) ? 0 : 1;
          const bp = b.name.toLowerCase().startsWith(q) ? 0 : 1;
          if (ap !== bp) return ap - bp;
          return a.name.localeCompare(b.name);
        })
        .slice(0, 10);
      setSuggestions(matches);
      setOpen(true);
    }, 80);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [query, selected]);

  const add = (name: string) => {
    if (!name.trim() || selected.map(s => s.toLowerCase()).includes(name.trim().toLowerCase())) return;
    onChange([...selected, name.trim()]);
    setQuery("");
    setSuggestions([]);
    setOpen(false);
    inputRef.current?.focus();
  };

  const remove = (name: string) => onChange(selected.filter(s => s !== name));

  const inputCls = "flex-1 min-w-[120px] bg-transparent text-sm text-gray-200 placeholder-gray-500 outline-none py-0.5";

  const wrapperRef = useRef<HTMLDivElement>(null);

  return (
    <div>
      {/* Tags + input row (also the dropdown anchor) */}
      <div
        ref={wrapperRef}
        className="flex flex-wrap gap-1 px-2 py-1.5 bg-gray-900 border border-gray-700 rounded focus-within:border-purple-500 cursor-text min-h-[30px]"
        onClick={() => inputRef.current?.focus()}
      >
        {selected.map(name => (
          <span key={name} className="flex items-center gap-1 text-[12px] bg-amber-900/40 border border-amber-700/40 text-amber-300 rounded px-1.5 py-0.5">
            <Sword className="w-2.5 h-2.5 shrink-0" />
            {name}
            <button type="button" onClick={e => { e.stopPropagation(); remove(name); }} className="text-amber-500 hover:text-red-400 transition-colors">
              <X className="w-2.5 h-2.5" />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => {
            if (isImeComposing(e)) return;
            if (e.key === "Enter") { e.preventDefault(); if (query.trim()) add(query.trim()); }
            if (e.key === "Backspace" && !query && selected.length) remove(selected[selected.length - 1]);
            if (e.key === "Escape") { setOpen(false); setQuery(""); }
          }}
          // Reopen the dropdown when refocusing a field that still has a query
          // and cached matches (an outside-click dismiss sets open=false but
          // leaves suggestions intact) — otherwise the list is unreachable
          // without changing the query.
          onFocus={() => { if (query.trim() && suggestions.length) setOpen(true); }}
          placeholder={selected.length === 0 ? "Search or type a weapon…" : "Add more…"}
          className={inputCls}
        />
      </div>

      <AnchoredDropdown
        anchor={wrapperRef.current}
        open={open && suggestions.length > 0}
        onRequestClose={() => setOpen(false)}
      >
        {suggestions.map(w => (
          <button
            key={w.id}
            type="button"
            onMouseDown={e => { e.preventDefault(); add(w.name); }}
            className="w-full flex items-center gap-2 px-2 py-1.5 hover:bg-amber-900/30 text-left transition-colors"
          >
            <div className="flex-1 min-w-0">
              <span className="text-sm text-gray-200">{w.name}</span>
              {w.category && <span className="text-[11px] text-gray-600 ml-1 capitalize">{w.category}</span>}
            </div>
            {w.damage && (
              <span className="text-[12px] text-amber-400 shrink-0 font-mono">
                {w.damage}{w.damage_type ? ` ${w.damage_type[0]}` : ""}
              </span>
            )}
            {(w.properties || []).slice(0, 3).map(p => (
              <span key={p} className="text-[11px] text-gray-600 shrink-0 hidden sm:inline">{p.slice(0, 3)}</span>
            ))}
          </button>
        ))}
        {query && !suggestions.some(s => s.name.toLowerCase() === query.toLowerCase()) && (
          <button
            type="button"
            onMouseDown={e => { e.preventDefault(); add(query); }}
            className="w-full flex items-center gap-1.5 px-2 py-1.5 text-left hover:bg-gray-800 border-t border-gray-800 text-gray-500 text-sm"
          >
            <Plus className="w-3 h-3" />Add "{query}" as custom weapon
          </button>
        )}
      </AnchoredDropdown>
    </div>
  );
}

// ── Inline weapon pill showing DB stats ───────────────────────────────────
// Clicking a weapon pill opens its card in the Compendium (`dm-open-weapon`,
// routed by App.tsx — it places a Compendium tile if there isn't one).
function openWeaponInCompendium(name: string): void {
  window.dispatchEvent(new CustomEvent("dm-open-weapon", { detail: { name } }));
}

function WeaponPill({ name, statsMap }: { name: string; statsMap: Map<string, WeaponInfo> }) {
  const info = statsMap.get(name.toLowerCase());
  // Range for a ranged / thrown weapon, else melee reach — right after the damage.
  const distance = info ? weaponDistanceShort(info) : null;
  return (
    <button
      type="button"
      onClick={() => openWeaponInCompendium(name)}
      title={`Open ${name} in the Compendium`}
      aria-label={`Open ${name} in the Compendium`}
      className="inline-flex items-center gap-1 text-[12px] bg-amber-900/25 border border-amber-800/30 rounded px-1.5 py-0.5 text-amber-300 hover:bg-amber-800/40 hover:border-amber-600/60 hover:text-amber-100 transition-colors cursor-pointer">
      <Sword className="w-2.5 h-2.5 shrink-0" />
      <span>{name}</span>
      {info?.damage && (
        <span className="text-amber-500 font-mono">
          {info.damage}{info.damage_type ? ` ${info.damage_type.slice(0, 1)}` : ""}
        </span>
      )}
      {distance && (
        <span
          className="inline-flex items-center gap-0.5 text-[11px] font-semibold rounded px-1 bg-sky-900/50 border border-sky-700/60 text-sky-300"
          title={info && weaponRange(info) ? "Normal / long range" : "Melee reach"}
        >
          <MoveHorizontal className="w-2.5 h-2.5 shrink-0" aria-hidden />
          {distance}
        </span>
      )}
    </button>
  );
}

// ── Spell tag-input (mirror of WeaponTagInput against the 557-spell dataset)
type SpellInfo = Pick<
  Spell,
  | "name" | "level" | "school" | "classes" | "damage" | "healing"
  | "castingTime" | "range" | "duration" | "concentration" | "ritual" | "upcast"
>;

// Inline pill rendered on a saved character. Mirrors WeaponPill: a "stats at
// a glance" badge with the spell's damage dice + type when it deals damage,
// the healing dice (+ heart icon) when it heals, or level + school for
// utility spells like Mage Hand. A spell can do both — `damage` takes
// priority for the badge slot.
//
// Clicking a pill opens the spell in the Wizard's Tome (`dm-open-spell`,
// routed by App.tsx — it places a Tome tile if there isn't one).
function openSpellInTome(name: string): void {
  window.dispatchEvent(new CustomEvent("dm-open-spell", { detail: { name } }));
}

function SpellPill({
  name,
  statsMap,
  known = false,
}: {
  name: string;
  statsMap: Map<string, SpellInfo>;
  /** Known but not prepared — drawn dimmed with a dashed border. */
  known?: boolean;
}) {
  const info = statsMap.get(name.toLowerCase());
  const levelLabel =
    info == null ? null : info.level === 0 ? "Cantrip" : `Lv ${info.level}`;
  return (
    <button
      type="button"
      onClick={() => openSpellInTome(name)}
      title={`Open ${name} in the Wizard's Tome${known ? " (known, not prepared)" : ""}`}
      aria-label={`Open ${name} in the Wizard's Tome`}
      className={`inline-flex items-center gap-1 text-[12px] rounded px-1.5 py-0.5 transition-colors cursor-pointer ${
        known
          ? "border border-dashed border-gray-600 text-gray-400 opacity-80 hover:opacity-100 hover:text-cyan-200"
          : "bg-cyan-900/25 border border-cyan-800/30 text-cyan-300 hover:bg-cyan-800/40 hover:border-cyan-600/60 hover:text-cyan-100"
      }`}>
      <BookOpen className="w-2.5 h-2.5 shrink-0" />
      <span>{name}</span>
      {info?.damage ? (
        <span
          className="text-cyan-500 font-mono"
          title={info.damage.scaling ?? undefined}
        >
          {info.damage.dice} {info.damage.type[0]?.toUpperCase()}
        </span>
      ) : info?.healing ? (
        <span
          className="flex items-center gap-0.5 text-emerald-400 font-mono"
          title={info.healing.scaling ?? undefined}
        >
          <Heart className="w-2.5 h-2.5 shrink-0" />
          {info.healing.dice}
        </span>
      ) : (
        levelLabel && (
          <span className="text-cyan-500 font-mono">{levelLabel}</span>
        )
      )}
      {info?.school && (
        <span className="text-cyan-700">{info.school.slice(0, 3)}</span>
      )}
    </button>
  );
}

function SpellTagInput({
  selected,
  onChange,
  isPrepared: isSpellPrepared,
  onTogglePrepared,
}: {
  selected: string[];
  onChange: (names: string[]) => void;
  /** Prepared-spell toggle (Party edit form). Omit to hide it. */
  isPrepared?: (name: string) => boolean;
  onTogglePrepared?: (name: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<SpellInfo[]>([]);
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (!query.trim()) { setSuggestions([]); setOpen(false); return; }
    timer.current = setTimeout(() => {
      const q = query.trim().toLowerCase();
      const selectedLower = new Set(selected.map(s => s.toLowerCase()));
      const matches = spellData
        .filter(s => s.name.toLowerCase().includes(q) && !selectedLower.has(s.name.toLowerCase()))
        .sort((a, b) => {
          const ap = a.name.toLowerCase().startsWith(q) ? 0 : 1;
          const bp = b.name.toLowerCase().startsWith(q) ? 0 : 1;
          if (ap !== bp) return ap - bp;
          if (a.level !== b.level) return a.level - b.level;
          return a.name.localeCompare(b.name);
        })
        .slice(0, 10);
      setSuggestions(matches);
      setOpen(true);
    }, 80);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [query, selected]);

  const add = (name: string) => {
    if (!name.trim() || selected.map(s => s.toLowerCase()).includes(name.trim().toLowerCase())) return;
    onChange([...selected, name.trim()]);
    setQuery("");
    setSuggestions([]);
    setOpen(false);
    inputRef.current?.focus();
  };

  const remove = (name: string) => onChange(selected.filter(s => s !== name));

  const inputCls = "flex-1 min-w-[120px] bg-transparent text-sm text-gray-200 placeholder-gray-500 outline-none py-0.5";

  const wrapperRef = useRef<HTMLDivElement>(null);

  return (
    <div>
      <div
        ref={wrapperRef}
        className="flex flex-wrap gap-1 px-2 py-1.5 bg-gray-900 border border-gray-700 rounded focus-within:border-purple-500 cursor-text min-h-[30px]"
        onClick={() => inputRef.current?.focus()}
      >
        {selected.map(name => {
          const prepared = isSpellPrepared ? isSpellPrepared(name) : true;
          return (
          <span key={name} className={`flex items-center gap-1 text-[12px] rounded px-1.5 py-0.5 border ${
            prepared
              ? "bg-cyan-900/40 border-cyan-700/40 text-cyan-300"
              : "bg-gray-800/60 border-dashed border-gray-600 text-gray-400"
          }`}>
            {onTogglePrepared ? (
              <button
                type="button"
                onClick={e => { e.stopPropagation(); onTogglePrepared(name); }}
                aria-pressed={prepared}
                aria-label={prepared ? `Unprepare ${name}` : `Prepare ${name}`}
                title={prepared ? "Prepared — click to mark as known only" : "Known, not prepared — click to prepare"}
                className={`shrink-0 transition-colors ${prepared ? "text-cyan-300 hover:text-white" : "text-gray-500 hover:text-cyan-300"}`}
              >
                {prepared ? <CircleCheck className="w-3 h-3" /> : <Circle className="w-3 h-3" />}
              </button>
            ) : (
              <BookOpen className="w-2.5 h-2.5 shrink-0" />
            )}
            {name}
            <button type="button" onClick={e => { e.stopPropagation(); remove(name); }} aria-label={`Remove ${name}`} className="text-cyan-500 hover:text-red-400 transition-colors">
              <X className="w-2.5 h-2.5" />
            </button>
          </span>
          );
        })}
        <input
          ref={inputRef}
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => {
            if (isImeComposing(e)) return;
            if (e.key === "Enter") { e.preventDefault(); if (query.trim()) add(query.trim()); }
            if (e.key === "Backspace" && !query && selected.length) remove(selected[selected.length - 1]);
            if (e.key === "Escape") { setOpen(false); setQuery(""); }
          }}
          // Reopen cached matches on refocus after an outside-click dismiss —
          // see WeaponTagInput for the rationale.
          onFocus={() => { if (query.trim() && suggestions.length) setOpen(true); }}
          placeholder={selected.length === 0 ? "Search or type a spell…" : "Add more…"}
          className={inputCls}
        />
      </div>

      <AnchoredDropdown
        anchor={wrapperRef.current}
        open={open && suggestions.length > 0}
        onRequestClose={() => setOpen(false)}
      >
        {suggestions.map(s => (
          <button
            key={s.name}
            type="button"
            onMouseDown={e => { e.preventDefault(); add(s.name); }}
            className="w-full flex items-center gap-2 px-2 py-1.5 hover:bg-cyan-900/30 text-left transition-colors"
          >
            <div className="flex-1 min-w-0">
              <span className="text-sm text-gray-200">{s.name}</span>
              <span className="text-[11px] text-gray-600 ml-1">
                {s.level === 0 ? "Cantrip" : `Lvl ${s.level}`} · {s.school}
              </span>
            </div>
            {s.classes && s.classes.length > 0 && (
              <span className="text-[11px] text-gray-600 shrink-0 hidden sm:inline">
                {s.classes.slice(0, 3).map(c => c.slice(0, 3)).join("/")}
              </span>
            )}
          </button>
        ))}
        {query && !suggestions.some(s => s.name.toLowerCase() === query.toLowerCase()) && (
          <button
            type="button"
            onMouseDown={e => { e.preventDefault(); add(query); }}
            className="w-full flex items-center gap-1.5 px-2 py-1.5 text-left hover:bg-gray-800 border-t border-gray-800 text-gray-500 text-sm"
          >
            <Plus className="w-3 h-3" />Add "{query}" as custom spell
          </button>
        )}
      </AnchoredDropdown>
    </div>
  );
}

// Ability scores as form strings ("" = not recorded) and back.
type AbilityForm = Record<(typeof ABILITY_KEYS)[number], string>;
const abilitiesToForm = (a: AbilityScores | null | undefined): AbilityForm =>
  Object.fromEntries(ABILITY_KEYS.map(k => [k, a?.[k] != null ? String(a[k]) : ""])) as AbilityForm;
function formToAbilities(f: AbilityForm): AbilityScores | null {
  const out = {} as AbilityScores;
  let any = false;
  for (const k of ABILITY_KEYS) {
    const n = parseInt(f[k], 10);
    out[k] = Number.isFinite(n) ? n : null;
    if (out[k] != null) any = true;
  }
  return any ? out : null; // the store clamps each to 1–30
}

// ── emptyForm with weapons as array ───────────────────────────────────────
const emptyForm = () => ({
  name: "", race: "", class: "", level: "1",
  ac: "", hp: "",
  spells: [] as string[],
  // null = every spell prepared (see lib/preparedSpells.ts).
  prepared: null as string[] | null,
  weapons: [] as string[],
  abilities: abilitiesToForm(null),
  ddbUrl: "",
  // Not edited in the form (set by clicking on the character sheet, or by a
  // D&D Beyond import) — carried through so saving an edit keeps them.
  skills: null as PlayerCharacter["skills"],
});

type CharacterForm = ReturnType<typeof emptyForm>;

const INPUT_CLS =
  "w-full px-2 py-1 bg-gray-900 border border-gray-700 rounded text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-purple-500";

// Module-scope (not nested inside PartyWidget) so React keeps the same
// component identity across renders — otherwise every keystroke unmounts
// and remounts the inputs and the focused field loses focus mid-type.
function FormFields({
  f,
  setF,
}: {
  f: CharacterForm;
  setF: (v: CharacterForm) => void;
}) {
  return (
    <div className="space-y-1.5">
      <input placeholder="Name *" value={f.name}
        onChange={e => setF({ ...f, name: e.target.value })} className={INPUT_CLS} />
      <div className="flex gap-1">
        <Combobox
          value={f.race}
          onChange={(v) => setF({ ...f, race: v })}
          options={PLAYER_RACES}
          placeholder="Race"
          ariaLabel="Race"
          className="flex-1"
        />
        <Combobox
          value={f.class}
          onChange={(v) => setF({ ...f, class: v })}
          options={PLAYER_CLASSES}
          placeholder="Class"
          ariaLabel="Class"
          className="flex-1"
        />
      </div>
      <div className="flex gap-1">
        <div className="w-16 shrink-0">
          <label className="text-[12px] text-gray-500 block mb-0.5">Level</label>
          <input type="number" min="1" max="20" value={f.level}
            onChange={e => setF({ ...f, level: e.target.value })} className={INPUT_CLS} />
        </div>
        <div className="flex-1">
          <label className="text-[12px] text-gray-500 block mb-0.5">AC</label>
          <input type="number" value={f.ac}
            onChange={e => setF({ ...f, ac: e.target.value })} className={INPUT_CLS} />
        </div>
        <div className="flex-1">
          <label className="text-[12px] text-gray-500 block mb-0.5">Max HP</label>
          <input type="number" value={f.hp}
            onChange={e => setF({ ...f, hp: e.target.value })} className={INPUT_CLS} />
        </div>
      </div>
      {/* D&D Beyond link — optional; shown as a link on the character sheet */}
      <div>
        <label className="text-[12px] text-gray-500 block mb-0.5">D&amp;D Beyond link</label>
        <input
          type="url"
          inputMode="url"
          aria-label="D&D Beyond link"
          placeholder="https://www.dndbeyond.com/characters/…"
          value={f.ddbUrl}
          onChange={e => setF({ ...f, ddbUrl: e.target.value })}
          className={INPUT_CLS}
        />
        {f.ddbUrl.trim() && !normalizeDdbUrl(f.ddbUrl) && (
          <p className="text-[11px] text-red-400 mt-0.5">Paste a dndbeyond.com link (or the character's number).</p>
        )}
      </div>
      {/* Ability scores — optional; shown on the character sheet */}
      <div>
        <label className="text-[12px] text-gray-500 block mb-0.5">Ability scores</label>
        <div className="grid grid-cols-6 gap-1">
          {ABILITY_KEYS.map(k => (
            <div key={k} className="min-w-0">
              <span className="block text-center text-[10px] font-semibold text-gray-500">{ABILITY_LABELS[k].short}</span>
              <input
                type="number" min="1" max="30" inputMode="numeric"
                aria-label={ABILITY_LABELS[k].long}
                value={f.abilities[k]}
                onChange={e => setF({ ...f, abilities: { ...f.abilities, [k]: e.target.value } })}
                placeholder="—"
                className={`${INPUT_CLS} text-center px-0.5`}
              />
            </div>
          ))}
        </div>
      </div>
      {/* Weapons — searchable tag input */}
      <div>
        <label className="text-[12px] text-gray-500 block mb-0.5">Weapons</label>
        <WeaponTagInput
          selected={f.weapons}
          onChange={weapons => setF({ ...f, weapons })}
        />
      </div>
      {/* Spells — searchable tag input */}
      <div>
        <label className="text-[12px] text-gray-500 block mb-0.5">Spells</label>
        <SpellTagInput
          selected={f.spells}
          onChange={spells => {
            // New spells start prepared; removed ones drop out of `prepared`.
            let prepared = f.prepared;
            for (const added of spells.filter(sp => !f.spells.includes(sp))) {
              prepared = preparedAfterAdding({ spells: f.spells, prepared }, added);
            }
            if (prepared) {
              const keep = new Set(spells.map(sp => sp.toLowerCase()));
              prepared = prepared.filter(p => keep.has(p.toLowerCase()));
            }
            setF({ ...f, spells, prepared });
          }}
          isPrepared={name => isPrepared(f, name)}
          onTogglePrepared={name => setF({ ...f, prepared: togglePrepared(f, name) })}
        />
        {f.spells.length > 0 && (
          <p className="text-[11px] text-gray-500 mt-0.5 flex items-center gap-1">
            <CircleCheck className="w-3 h-3 text-cyan-400" />prepared
            <Circle className="w-3 h-3 ml-1.5" />known only — click the circle to switch
          </p>
        )}
      </div>
    </div>
  );
}

// Lowercased-name lookup for the inline weapon stat pills. Built once.
// Includes Unarmed Strike, which every character is shown with.
const WEAPON_STATS_BY_NAME: Map<string, WeaponInfo> = new Map(
  [UNARMED_STRIKE, ...weaponsData].map(w => [w.name.toLowerCase(), w]),
);

// Same idea, but for spell pills.
const SPELL_STATS_BY_NAME: Map<string, SpellInfo> = new Map(
  spellData.map(s => [s.name.toLowerCase(), s]),
);

// D&D Beyond names → the bundled datasets' spelling where they match
// case-insensitively, so imported tags get the same stat pills as picked ones.
function canonicalNames(names: string[], byName: Map<string, { name: string }>): string[] {
  return names.map(n => byName.get(n.toLowerCase())?.name ?? n);
}

function importToForm(r: DdbImportResult): CharacterForm {
  const c = r.character;
  return {
    name: c.name,
    race: c.race ?? "",
    class: c.class ?? "",
    level: String(c.level),
    ac: c.ac != null ? String(c.ac) : "",
    hp: c.hp != null ? String(c.hp) : "",
    weapons: canonicalNames(c.weapons, WEAPON_STATS_BY_NAME),
    spells: canonicalNames(c.spells, SPELL_STATS_BY_NAME),
    prepared: c.prepared ? canonicalNames(c.prepared, SPELL_STATS_BY_NAME) : null,
    abilities: abilitiesToForm(c.abilities),
    // An imported character always gets its D&D Beyond sheet link.
    ddbUrl: r.ddbId != null ? ddbCharacterSheetUrl(r.ddbId) : "",
    skills: c.skills ?? null,
  };
}

/** The form's link field → a stored URL. "" saves as no link; anything that
 *  isn't a D&D Beyond link throws so the save shows an error instead of
 *  silently dropping what the DM pasted. */
function formDdbUrl(f: CharacterForm): string | null {
  if (!f.ddbUrl.trim()) return null;
  const url = normalizeDdbUrl(f.ddbUrl);
  if (!url) throw new Error("the D&D Beyond link isn't a dndbeyond.com address");
  return url;
}

// Shown above the prefilled form until the DM saves or cancels it.
function ImportReviewNote({ warnings }: { warnings: string[] }) {
  return (
    <div className="mb-2 text-[12px] text-amber-300 bg-amber-900/20 border border-amber-800/40 rounded px-2 py-1 space-y-0.5">
      <p>Imported from D&amp;D Beyond — check AC and Max HP against the sheet, then save.</p>
      {warnings.map(w => <p key={w} className="text-amber-400/80">• {w}</p>)}
    </div>
  );
}

// ── Main widget ────────────────────────────────────────────────────────────
export function PartyWidget() {
  const characters = useParty();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(emptyForm());

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState(emptyForm());

  // D&D Beyond import: the panel, and the review note shown over whichever
  // form (new, or editing an existing same-named character) it prefilled.
  const [showDdb, setShowDdb] = useState(false);
  const [importNote, setImportNote] = useState<
    { target: "new" | number; warnings: string[] } | null
  >(null);

  // The scrolling body. Opening a form (or landing an import) while the DM
  // is scrolled down the roster would otherwise put it out of view.
  const bodyRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (showAdd || showDdb) bodyRef.current?.scrollTo?.({ top: 0 });
  }, [showAdd, showDdb]);
  useEffect(() => {
    if (editingId == null) return;
    bodyRef.current
      ?.querySelector(`[data-pc-id="${editingId}"]`)
      ?.scrollIntoView?.({ block: "nearest" });
  }, [editingId]);

  const weaponStats = useMemo(() => WEAPON_STATS_BY_NAME, []);
  const spellStats = useMemo(() => SPELL_STATS_BY_NAME, []);

  // Auto-dismiss the transient success banner so it doesn't linger.
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(t);
  }, [notice]);

  // Rows collapsed to a single line (weapons + spells hidden). Persisted so a
  // reload keeps the DM's tidy roster; ids of deleted characters are pruned.
  const [collapsed, setCollapsed] = useLocalStorage<number[]>(
    "dm-party-collapsed-v1",
    [],
    validatePartyCollapsed,
  );
  const toggleCollapsed = (id: number) =>
    setCollapsed(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));
  useEffect(() => {
    const live = new Set(characters.map(c => c.id));
    if (collapsed.some(id => !live.has(id))) setCollapsed(collapsed.filter(id => live.has(id)));
  }, [characters, collapsed, setCollapsed]);

  // Rows whose known-but-not-prepared spells are expanded (view state only).
  const [knownOpenFor, setKnownOpenFor] = useState<Set<number>>(() => new Set());
  const toggleKnownFor = (id: number) =>
    setKnownOpenFor(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  // Per-row initiative
  const [initiativeFor, setInitiativeFor] = useState<number | null>(null);
  const [initiativeVal, setInitiativeVal] = useState("");

  // Mini character sheet (AC/HP/spells/weapons at a glance). Tracked by id,
  // not the object itself, so the sheet stays live if the character is
  // edited while open; it auto-closes if the character is deleted.
  const [sheetForId, setSheetForId] = useState<number | null>(null);
  const sheetChar =
    sheetForId != null ? characters.find((c) => c.id === sheetForId) ?? null : null;

  // ── Save new character ───────────────────────────────────────────────────
  const save = () => {
    if (!form.name.trim()) return;
    try {
      addCharacter({
        name: form.name.trim(),
        race: form.race.trim() || null,
        class: form.class.trim() || null,
        level: parseInt(form.level) || 1,
        ac: form.ac ? parseInt(form.ac) : null,
        hp: form.hp ? parseInt(form.hp) : null,
        spells: form.spells,
        prepared: form.prepared,
        abilities: formToAbilities(form.abilities),
        ddbUrl: formDdbUrl(form),
        skills: form.skills,
        weapons: form.weapons,
      });
      setForm(emptyForm()); setShowAdd(false); setError(null); setImportNote(null);
    } catch (e) { setError(`Failed to save: ${(e as Error).message}`); }
  };

  // ── Save edit ────────────────────────────────────────────────────────────
  const saveEdit = () => {
    if (editingId === null || !editForm.name.trim()) return;
    try {
      updateCharacter(editingId, {
        name: editForm.name.trim(),
        race: editForm.race.trim() || null,
        class: editForm.class.trim() || null,
        level: parseInt(editForm.level) || 1,
        ac: editForm.ac ? parseInt(editForm.ac) : null,
        hp: editForm.hp ? parseInt(editForm.hp) : null,
        spells: editForm.spells,
        prepared: editForm.prepared,
        abilities: formToAbilities(editForm.abilities),
        ddbUrl: formDdbUrl(editForm),
        skills: editForm.skills,
        weapons: editForm.weapons,
      });
      setEditingId(null); setError(null); setImportNote(null);
    } catch (e) { setError(`Failed to update: ${(e as Error).message}`); }
  };

  const deleteChar = (c: PlayerCharacter) => {
    const label = c.name?.trim() || "this character";
    if (!window.confirm(`Delete ${label}? This can't be undone.`)) return;
    try {
      deleteCharacter(c.id);
    } catch (e) { setError(`Failed to delete: ${(e as Error).message}`); }
  };

  const startEdit = (c: PlayerCharacter) => {
    setImportNote(null);
    setEditingId(c.id);
    setEditForm({
      name: c.name, race: c.race || "", class: c.class || "",
      level: String(c.level), ac: c.ac != null ? String(c.ac) : "",
      hp: c.hp != null ? String(c.hp) : "",
      spells: c.spells || [],
      prepared: c.prepared ?? null,
      abilities: abilitiesToForm(c.abilities),
      weapons: c.weapons || [],
      ddbUrl: c.ddbUrl ?? "",
      skills: c.skills ?? null,
    });
  };

  // A D&D Beyond character lands in an editable form, never straight in the
  // roster: AC / HP are re-derived from equipment + modifiers and may need a
  // tweak. If a character with the same name already exists, the import
  // refreshes that one (Save updates it) instead of creating a duplicate.
  const applyDdbImport = (r: DdbImportResult) => {
    const next = importToForm(r);
    const key = next.name.trim().toLowerCase();
    const existing = characters.find(c => c.name.trim().toLowerCase() === key);
    setShowDdb(false);
    setError(null);
    if (existing) {
      setImportNote({ target: existing.id, warnings: r.warnings });
      setShowAdd(false);
      setEditingId(existing.id);
      setEditForm(next);
      setNotice(`${existing.name} is already in the party — review the D&D Beyond data and Save to update.`);
    } else {
      setImportNote({ target: "new", warnings: r.warnings });
      setEditingId(null);
      setForm(next);
      setShowAdd(true);
    }
  };

  const exportParty = () => {
    const stamp = new Date().toISOString().slice(0, 10);
    downloadJsonFile(`selene-party-${stamp}.json`, exportPartyAsJson());
  };

  const importParty = async () => {
    let text: string;
    try {
      text = await promptForJsonFile();
    } catch (e) {
      if ((e as DOMException).name === "AbortError") return;
      setError(`Import failed: ${(e as Error).message}`);
      return;
    }
    let prepared;
    try {
      prepared = preparePartyImport(text);
    } catch (e) {
      setError(`Import failed: ${(e as Error).message}`);
      return;
    }
    const { summary, commit } = prepared;
    const charWord = (n: number) => `character${n === 1 ? "" : "s"}`;
    let prompt =
      summary.currentCount > 0
        ? `Replace your current ${summary.currentCount} ${charWord(summary.currentCount)} ` +
          `with ${summary.accepted} imported ${charWord(summary.accepted)}?`
        : `Import ${summary.accepted} ${charWord(summary.accepted)}?`;
    if (summary.dropped > 0) {
      prompt +=
        `\n\nNote: the file holds ${summary.dropped} more ${charWord(summary.dropped)} ` +
        `beyond the party-size limit; they will be skipped.`;
    }
    if (!window.confirm(prompt)) return;
    try {
      const count = commit();
      // A successful import replaces the whole roster — drop any in-progress
      // add/edit so a stale form (e.g. editing an id the import dropped) can't
      // silently no-op on save.
      setEditingId(null);
      setShowAdd(false);
      setForm(emptyForm());
      setError(null);
      setNotice(`Imported ${count} ${charWord(count)}.`);
    } catch (e) {
      setError(`Import failed: ${(e as Error).message}`);
    }
  };

  const addToInitiative = (c: PlayerCharacter) => {
    const combatant: Combatant = {
      id: mintCombatantId(),
      name: c.name,
      // Same clamp as the Initiative widget's own add forms — a raw parseInt
      // here was the one entry point a typo'd "2000" could still sneak through.
      initiative: clampInitiative(initiativeVal),
      hp: c.hp || 0,
      maxHp: c.hp || 0,
      ac: c.ac ?? undefined,
      isPlayer: true,
    };
    const result = addCombatantToInitiative(combatant, {
      confirmDuplicate: confirmDuplicateViaWindow,
    });
    if (result === "full") {
      window.alert(initiativeFullMessage());
      return;
    }
    if (result === "error") {
      window.alert(
        "Couldn't add to initiative — place the Initiative tile and try again.",
      );
      return;
    }
    // "cancelled": the DM declined the duplicate confirm. Leave the form open
    // with their typed initiative intact — a mis-click shouldn't cost the roll.
    if (result === "cancelled") return;
    setInitiativeFor(null); setInitiativeVal("");
  };

  return (
    <div className="@container h-full min-h-0 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between gap-1 mb-2 shrink-0">
        <span className="text-sm text-gray-400 truncate min-w-0">
          {characters.length} character{characters.length !== 1 ? "s" : ""}
        </span>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={exportParty}
            disabled={characters.length === 0}
            title="Export party to JSON"
            className="w-6 h-6 flex items-center justify-center text-emerald-500 hover:text-emerald-300 hover:bg-emerald-900/30 rounded transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
          >
            <Download className="w-3 h-3" />
          </button>
          <button
            onClick={importParty}
            title="Import party from JSON (replaces current roster)"
            className="w-6 h-6 flex items-center justify-center text-emerald-500 hover:text-emerald-300 hover:bg-emerald-900/30 rounded transition-colors"
          >
            <Upload className="w-3 h-3" />
          </button>
          <button
            onClick={() => setShowDdb(v => !v)}
            title="Import a character from D&D Beyond"
            aria-label="Import from D&D Beyond"
            aria-pressed={showDdb}
            className="w-6 h-6 flex items-center justify-center text-sky-500 hover:text-sky-300 hover:bg-sky-900/30 rounded transition-colors"
          >
            <CloudDownload className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setShowAdd(v => !v)}
            title="Add a character"
            aria-label="Add Character"
            className="flex items-center gap-1 text-sm px-2 py-1 bg-emerald-900/40 hover:bg-emerald-800/50 rounded text-emerald-400 transition-colors whitespace-nowrap"
          >
            <Plus className="w-3 h-3" />Add<span className="hidden @[17rem]:inline"> Character</span>
          </button>
        </div>
      </div>

      {/* Body — ONE scroll region for everything that can grow: banners, the
          D&D Beyond panel, the add form and the roster. The forms used to be
          fixed (shrink-0) blocks above a separately-scrolling list, so a form
          taller than the tile was clipped with its Save button unreachable. */}
      <div ref={bodyRef} className="flex-1 min-h-16 overflow-y-auto">
      {error && (
        <div className="text-sm text-red-400 bg-red-900/20 border border-red-800/40 rounded px-2 py-1 mb-2">
          {error}
        </div>
      )}

      {notice && (
        <div className="text-sm text-emerald-300 bg-emerald-900/20 border border-emerald-800/40 rounded px-2 py-1 mb-2">
          {notice}
        </div>
      )}

      {showDdb && (
        <DdbImportPanel onImported={applyDdbImport} onCancel={() => setShowDdb(false)} />
      )}

      {/* Add form */}
      {showAdd && (
        <div className="mb-2 p-2 bg-gray-900/80 border border-emerald-700/40 rounded">
          <p className="text-sm font-semibold text-emerald-400 mb-2">New character</p>
          {importNote?.target === "new" && <ImportReviewNote warnings={importNote.warnings} />}
          <FormFields f={form} setF={setForm} />
          <div className="flex gap-1 mt-2">
            <button onClick={save} disabled={!form.name.trim()}
              className="flex-1 py-1 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 rounded text-sm text-white font-semibold transition-colors">
              Save Character
            </button>
            <button onClick={() => { setShowAdd(false); setForm(emptyForm()); setImportNote(null); }}
              className="px-2 py-1 bg-gray-800 hover:bg-gray-700 rounded text-sm text-gray-400 transition-colors">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Character list */}
      <div className="space-y-1.5">
        {characters.length === 0 && !showAdd && (
          <div className="text-center py-6 flex flex-col items-center gap-2">
            <Users className="w-8 h-8 text-gray-700" />
            <p className="text-sm text-gray-500">No characters yet</p>
            <p className="text-[12px] text-gray-600">Click "Add Character" to create one, or the cloud icon to import from D&amp;D Beyond</p>
          </div>
        )}

        {characters.map(c => { const isCollapsed = collapsed.includes(c.id); return (
          <div key={c.id} data-pc-id={c.id} className="bg-gray-900/60 border border-gray-800/60 rounded overflow-hidden">
            {editingId === c.id ? (
              <div className="p-2">
                {importNote?.target === c.id && <ImportReviewNote warnings={importNote.warnings} />}
                <FormFields f={editForm} setF={setEditForm} />
                <div className="flex gap-1 mt-2">
                  <button onClick={saveEdit}
                    className="flex-1 py-1 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 rounded text-sm text-white font-semibold">
                    Save
                  </button>
                  <button onClick={() => { setEditingId(null); setImportNote(null); }}
                    className="px-2 py-1 bg-gray-800 hover:bg-gray-700 rounded text-sm text-gray-400">
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                {/* Character header row — click opens the character sheet.
                    Collapsed: a single line (no race/class subline, and the
                    weapons + spells row below is hidden). */}
                <div
                  className={`flex items-center gap-2 px-2 cursor-pointer hover:bg-white/[0.04] transition-colors ${isCollapsed ? "py-1" : "py-1.5"}`}
                  onClick={() => setSheetForId(c.id)}
                  title="View character sheet"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-bold text-white truncate">{c.name}</span>
                      {c.level && (
                        <span className="text-[12px] text-amber-400 shrink-0 flex items-center gap-0.5">
                          <Star className="w-2.5 h-2.5" />Lv {c.level}
                        </span>
                      )}
                    </div>
                    {!isCollapsed && (
                      <div className="text-[12px] text-gray-500 truncate">
                        {[c.race, c.class].filter(Boolean).join(" · ") || "—"}
                      </div>
                    )}
                  </div>
                  {/* Stats badges */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    {c.ac != null && (
                      <span className="flex items-center gap-0.5 text-[12px] text-blue-400 bg-blue-900/30 border border-blue-800/30 rounded px-1 py-0.5">
                        <Shield className="w-2.5 h-2.5" />{c.ac}
                      </span>
                    )}
                    {c.hp != null && (
                      <span className="flex items-center gap-0.5 text-[12px] text-red-400 bg-red-900/30 border border-red-800/30 rounded px-1 py-0.5">
                        <Heart className="w-2.5 h-2.5" />{c.hp}
                      </span>
                    )}
                  </div>
                  {/* Action buttons — stop propagation so these don't also open the sheet */}
                  <div
                    className="flex items-center gap-0.5 shrink-0"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      onClick={() => toggleCollapsed(c.id)}
                      aria-expanded={!isCollapsed}
                      aria-label={isCollapsed ? `Expand ${c.name}` : `Collapse ${c.name} to one line`}
                      title={isCollapsed ? "Show weapons and spells" : "Collapse to one line"}
                      className="w-6 h-6 flex items-center justify-center text-gray-500 hover:text-gray-300 hover:bg-gray-700/40 rounded transition-colors">
                      {isCollapsed ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
                    </button>
                    <button
                      onClick={() => { setInitiativeFor(initiativeFor === c.id ? null : c.id); setInitiativeVal(""); }}
                      title="Add to Initiative" className="w-6 h-6 flex items-center justify-center text-purple-500 hover:text-purple-300 hover:bg-purple-900/30 rounded transition-colors">
                      <Swords className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => startEdit(c)}
                      title="Edit character"
                      aria-label="Edit character"
                      className="w-6 h-6 flex items-center justify-center text-gray-500 hover:text-gray-300 hover:bg-gray-700/40 rounded transition-colors">
                      <Pencil className="w-3 h-3" />
                    </button>
                    <button onClick={() => deleteChar(c)}
                      title="Delete character"
                      className="w-6 h-6 flex items-center justify-center text-gray-600 hover:text-red-400 hover:bg-red-900/20 rounded transition-colors">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>

                {/* Initiative quick-add */}
                {initiativeFor === c.id && (
                  <div className="flex items-center gap-1.5 px-2 py-1.5 bg-purple-900/20 border-t border-purple-800/30">
                    <span className="text-[12px] text-purple-400 shrink-0">Initiative roll:</span>
                    <input type="number" autoFocus value={initiativeVal}
                      onChange={e => setInitiativeVal(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter" && !isImeComposing(e)) addToInitiative(c); }}
                      placeholder="e.g. 14"
                      className="w-16 px-1.5 py-0.5 bg-gray-900 border border-purple-700 rounded text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-purple-500" />
                    <button onClick={() => addToInitiative(c)}
                      className="flex items-center gap-0.5 px-2 py-0.5 bg-purple-700 hover:bg-purple-600 rounded text-[12px] text-white font-semibold transition-colors">
                      <Check className="w-3 h-3" />Add
                    </button>
                    <button onClick={() => setInitiativeFor(null)} className="text-gray-600 hover:text-gray-400">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                )}

                {!isCollapsed && (
                <>
                {/* Weapons + spells detail row. Shown unless the row is collapsed; every character
                    can make an Unarmed Strike, listed first (display-only —
                    it isn't added to the stored weapons). */}
                <div className="px-2 py-1.5 border-t border-gray-800/40 space-y-1">
                    <div className="flex items-start gap-1 flex-wrap">
                      {withUnarmedStrike(c.weapons).map(w => (
                        <WeaponPill key={w} name={w} statsMap={weaponStats} />
                      ))}
                    </div>
                    {(c.spells?.length ?? 0) > 0 && (() => {
                      // Prepared spells as usual; known-only ones (e.g. the
                      // rest of a Wizard's spellbook) behind a "+N known"
                      // toggle so they don't flood the row.
                      const { prepared, known } = splitSpells(c);
                      const showKnown = knownOpenFor.has(c.id);
                      return (
                        <div className="flex items-start gap-1 flex-wrap">
                          {prepared.map(s => (
                            <SpellPill key={s} name={s} statsMap={spellStats} />
                          ))}
                          {known.length > 0 && (
                            <button
                              type="button"
                              onClick={() => toggleKnownFor(c.id)}
                              aria-expanded={showKnown}
                              title="Spells known but not prepared"
                              className="text-[12px] px-1.5 py-0.5 rounded text-gray-500 hover:text-gray-300 hover:bg-gray-800 transition-colors"
                            >
                              {showKnown ? "Hide known" : `+${known.length} known`}
                            </button>
                          )}
                          {showKnown && known.map(s => (
                            <SpellPill key={s} name={s} statsMap={spellStats} known />
                          ))}
                        </div>
                      );
                    })()}
                </div>
                </>
                )}
              </>
            )}
          </div>
        ); })}
      </div>
      </div>

      {sheetChar && (
        <CharacterSheetModal
          character={sheetChar}
          weaponStats={weaponStats}
          spellStats={spellStats}
          onClose={() => setSheetForId(null)}
          onOpenSpell={(name) => {
            // The sheet is a full-screen modal; close it so the Tome is visible.
            setSheetForId(null);
            openSpellInTome(name);
          }}
          onOpenWeapon={(name) => {
            setSheetForId(null);
            openWeaponInCompendium(name);
          }}
          onSetDdbUrl={(url) => {
            const { id, ...rest } = sheetChar;
            try {
              updateCharacter(id, { ...rest, ddbUrl: url });
            } catch (e) { setError(`Failed to save the link: ${(e as Error).message}`); }
          }}
          onSetSkills={(skills) => {
            const { id, ...rest } = sheetChar;
            try {
              updateCharacter(id, { ...rest, skills });
            } catch (e) { setError(`Failed to save skills: ${(e as Error).message}`); }
          }}
        />
      )}
    </div>
  );
}
