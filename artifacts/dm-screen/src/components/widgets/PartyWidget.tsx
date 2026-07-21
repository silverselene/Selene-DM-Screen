import { useState, useEffect, useMemo, useRef } from "react";
import {
  Users, Plus, Trash2, Pencil, Check, X, Swords, Shield,
  Heart, Star, BookOpen, Sword, Download, Upload,
} from "lucide-react";
import type { PlayerCharacter, Combatant } from "@/types";
import { weaponsData, type Weapon } from "@/data/weapons";
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
} from "@/lib/backup";
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

// ── Weapon summary used by the tag-input and pill components ─────────────
type WeaponInfo = Pick<
  Weapon,
  "id" | "name" | "category" | "damage" | "damage_type" | "properties" | "cost" | "weight"
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

  const inputCls = "flex-1 min-w-[120px] bg-transparent text-xs text-gray-200 placeholder-gray-500 outline-none py-0.5";

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
          <span key={name} className="flex items-center gap-1 text-[10px] bg-amber-900/40 border border-amber-700/40 text-amber-300 rounded px-1.5 py-0.5">
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
              <span className="text-xs text-gray-200">{w.name}</span>
              {w.category && <span className="text-[9px] text-gray-600 ml-1 capitalize">{w.category}</span>}
            </div>
            {w.damage && (
              <span className="text-[10px] text-amber-400 shrink-0 font-mono">
                {w.damage}{w.damage_type ? ` ${w.damage_type[0]}` : ""}
              </span>
            )}
            {(w.properties || []).slice(0, 3).map(p => (
              <span key={p} className="text-[9px] text-gray-600 shrink-0 hidden sm:inline">{p.slice(0, 3)}</span>
            ))}
          </button>
        ))}
        {query && !suggestions.some(s => s.name.toLowerCase() === query.toLowerCase()) && (
          <button
            type="button"
            onMouseDown={e => { e.preventDefault(); add(query); }}
            className="w-full flex items-center gap-1.5 px-2 py-1.5 text-left hover:bg-gray-800 border-t border-gray-800 text-gray-500 text-xs"
          >
            <Plus className="w-3 h-3" />Add "{query}" as custom weapon
          </button>
        )}
      </AnchoredDropdown>
    </div>
  );
}

// ── Inline weapon pill showing DB stats ───────────────────────────────────
function WeaponPill({ name, statsMap }: { name: string; statsMap: Map<string, WeaponInfo> }) {
  const info = statsMap.get(name.toLowerCase());
  return (
    <span className="inline-flex items-center gap-1 text-[10px] bg-amber-900/25 border border-amber-800/30 rounded px-1.5 py-0.5 text-amber-300">
      <Sword className="w-2.5 h-2.5 shrink-0" />
      <span>{name}</span>
      {info?.damage && (
        <span className="text-amber-500 font-mono">
          {info.damage}{info.damage_type ? ` ${info.damage_type.slice(0, 1)}` : ""}
        </span>
      )}
    </span>
  );
}

// ── Spell tag-input (mirror of WeaponTagInput against the 557-spell dataset)
type SpellInfo = Pick<
  Spell,
  "name" | "level" | "school" | "classes" | "damage" | "healing"
>;

// Inline pill rendered on a saved character. Mirrors WeaponPill: a "stats at
// a glance" badge with the spell's damage dice + type when it deals damage,
// the healing dice (+ heart icon) when it heals, or level + school for
// utility spells like Mage Hand. A spell can do both — `damage` takes
// priority for the badge slot.
function SpellPill({ name, statsMap }: { name: string; statsMap: Map<string, SpellInfo> }) {
  const info = statsMap.get(name.toLowerCase());
  const levelLabel =
    info == null ? null : info.level === 0 ? "Cantrip" : `Lv ${info.level}`;
  return (
    <span className="inline-flex items-center gap-1 text-[10px] bg-cyan-900/25 border border-cyan-800/30 rounded px-1.5 py-0.5 text-cyan-300">
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
    </span>
  );
}

function SpellTagInput({
  selected,
  onChange,
}: {
  selected: string[];
  onChange: (names: string[]) => void;
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

  const inputCls = "flex-1 min-w-[120px] bg-transparent text-xs text-gray-200 placeholder-gray-500 outline-none py-0.5";

  const wrapperRef = useRef<HTMLDivElement>(null);

  return (
    <div>
      <div
        ref={wrapperRef}
        className="flex flex-wrap gap-1 px-2 py-1.5 bg-gray-900 border border-gray-700 rounded focus-within:border-purple-500 cursor-text min-h-[30px]"
        onClick={() => inputRef.current?.focus()}
      >
        {selected.map(name => (
          <span key={name} className="flex items-center gap-1 text-[10px] bg-cyan-900/40 border border-cyan-700/40 text-cyan-300 rounded px-1.5 py-0.5">
            <BookOpen className="w-2.5 h-2.5 shrink-0" />
            {name}
            <button type="button" onClick={e => { e.stopPropagation(); remove(name); }} className="text-cyan-500 hover:text-red-400 transition-colors">
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
              <span className="text-xs text-gray-200">{s.name}</span>
              <span className="text-[9px] text-gray-600 ml-1">
                {s.level === 0 ? "Cantrip" : `Lvl ${s.level}`} · {s.school}
              </span>
            </div>
            {s.classes && s.classes.length > 0 && (
              <span className="text-[9px] text-gray-600 shrink-0 hidden sm:inline">
                {s.classes.slice(0, 3).map(c => c.slice(0, 3)).join("/")}
              </span>
            )}
          </button>
        ))}
        {query && !suggestions.some(s => s.name.toLowerCase() === query.toLowerCase()) && (
          <button
            type="button"
            onMouseDown={e => { e.preventDefault(); add(query); }}
            className="w-full flex items-center gap-1.5 px-2 py-1.5 text-left hover:bg-gray-800 border-t border-gray-800 text-gray-500 text-xs"
          >
            <Plus className="w-3 h-3" />Add "{query}" as custom spell
          </button>
        )}
      </AnchoredDropdown>
    </div>
  );
}

// ── emptyForm with weapons as array ───────────────────────────────────────
const emptyForm = () => ({
  name: "", race: "", class: "", level: "1",
  ac: "", hp: "",
  spells: [] as string[],
  weapons: [] as string[],
});

type CharacterForm = ReturnType<typeof emptyForm>;

const INPUT_CLS =
  "w-full px-2 py-1 bg-gray-900 border border-gray-700 rounded text-xs text-gray-200 placeholder-gray-500 focus:outline-none focus:border-purple-500";

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
          <label className="text-[10px] text-gray-500 block mb-0.5">Level</label>
          <input type="number" min="1" max="20" value={f.level}
            onChange={e => setF({ ...f, level: e.target.value })} className={INPUT_CLS} />
        </div>
        <div className="flex-1">
          <label className="text-[10px] text-gray-500 block mb-0.5">AC</label>
          <input type="number" value={f.ac}
            onChange={e => setF({ ...f, ac: e.target.value })} className={INPUT_CLS} />
        </div>
        <div className="flex-1">
          <label className="text-[10px] text-gray-500 block mb-0.5">Max HP</label>
          <input type="number" value={f.hp}
            onChange={e => setF({ ...f, hp: e.target.value })} className={INPUT_CLS} />
        </div>
      </div>
      {/* Weapons — searchable tag input */}
      <div>
        <label className="text-[10px] text-gray-500 block mb-0.5">Weapons</label>
        <WeaponTagInput
          selected={f.weapons}
          onChange={weapons => setF({ ...f, weapons })}
        />
      </div>
      {/* Spells — searchable tag input */}
      <div>
        <label className="text-[10px] text-gray-500 block mb-0.5">Spells</label>
        <SpellTagInput
          selected={f.spells}
          onChange={spells => setF({ ...f, spells })}
        />
      </div>
    </div>
  );
}

// Lowercased-name lookup for the inline weapon stat pills. Built once.
const WEAPON_STATS_BY_NAME: Map<string, WeaponInfo> = new Map(
  weaponsData.map(w => [w.name.toLowerCase(), w]),
);

// Same idea, but for spell pills.
const SPELL_STATS_BY_NAME: Map<string, SpellInfo> = new Map(
  spellData.map(s => [s.name.toLowerCase(), s]),
);

// ── Main widget ────────────────────────────────────────────────────────────
export function PartyWidget() {
  const characters = useParty();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(emptyForm());

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState(emptyForm());

  const weaponStats = useMemo(() => WEAPON_STATS_BY_NAME, []);
  const spellStats = useMemo(() => SPELL_STATS_BY_NAME, []);

  // Auto-dismiss the transient success banner so it doesn't linger.
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(t);
  }, [notice]);

  // Per-row initiative
  const [initiativeFor, setInitiativeFor] = useState<number | null>(null);
  const [initiativeVal, setInitiativeVal] = useState("");

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
        weapons: form.weapons,
      });
      setForm(emptyForm()); setShowAdd(false); setError(null);
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
        weapons: editForm.weapons,
      });
      setEditingId(null); setError(null);
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
    setEditingId(c.id);
    setEditForm({
      name: c.name, race: c.race || "", class: c.class || "",
      level: String(c.level), ac: c.ac != null ? String(c.ac) : "",
      hp: c.hp != null ? String(c.hp) : "",
      spells: c.spells || [],
      weapons: c.weapons || [],
    });
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
    <div className="h-full min-h-0 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-2 shrink-0">
        <span className="text-xs text-gray-400">
          {characters.length} character{characters.length !== 1 ? "s" : ""}
        </span>
        <div className="flex items-center gap-1">
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
            onClick={() => setShowAdd(v => !v)}
            className="flex items-center gap-1 text-xs px-2 py-1 bg-emerald-900/40 hover:bg-emerald-800/50 rounded text-emerald-400 transition-colors"
          >
            <Plus className="w-3 h-3" />Add Character
          </button>
        </div>
      </div>

      {error && (
        <div className="text-xs text-red-400 bg-red-900/20 border border-red-800/40 rounded px-2 py-1 mb-2 shrink-0">
          {error}
        </div>
      )}

      {notice && (
        <div className="text-xs text-emerald-300 bg-emerald-900/20 border border-emerald-800/40 rounded px-2 py-1 mb-2 shrink-0">
          {notice}
        </div>
      )}

      {/* Add form */}
      {showAdd && (
        <div className="mb-2 p-2 bg-gray-900/80 border border-emerald-700/40 rounded shrink-0">
          <p className="text-xs font-semibold text-emerald-400 mb-2">New character</p>
          <FormFields f={form} setF={setForm} />
          <div className="flex gap-1 mt-2">
            <button onClick={save} disabled={!form.name.trim()}
              className="flex-1 py-1 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 rounded text-xs text-white font-semibold transition-colors">
              Save Character
            </button>
            <button onClick={() => { setShowAdd(false); setForm(emptyForm()); }}
              className="px-2 py-1 bg-gray-800 hover:bg-gray-700 rounded text-xs text-gray-400 transition-colors">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Character list */}
      <div className="flex-1 min-h-0 overflow-y-auto space-y-1.5">
        {characters.length === 0 && !showAdd && (
          <div className="text-center py-6 flex flex-col items-center gap-2">
            <Users className="w-8 h-8 text-gray-700" />
            <p className="text-xs text-gray-500">No characters yet</p>
            <p className="text-[10px] text-gray-600">Click "Add Character" to create one</p>
          </div>
        )}

        {characters.map(c => (
          <div key={c.id} className="bg-gray-900/60 border border-gray-800/60 rounded overflow-hidden">
            {editingId === c.id ? (
              <div className="p-2">
                <FormFields f={editForm} setF={setEditForm} />
                <div className="flex gap-1 mt-2">
                  <button onClick={saveEdit}
                    className="flex-1 py-1 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 rounded text-xs text-white font-semibold">
                    Save
                  </button>
                  <button onClick={() => setEditingId(null)}
                    className="px-2 py-1 bg-gray-800 hover:bg-gray-700 rounded text-xs text-gray-400">
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                {/* Character header row */}
                <div className="flex items-center gap-2 px-2 py-1.5">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-white truncate">{c.name}</span>
                      {c.level && (
                        <span className="text-[10px] text-amber-400 shrink-0 flex items-center gap-0.5">
                          <Star className="w-2.5 h-2.5" />Lv {c.level}
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-gray-500 truncate">
                      {[c.race, c.class].filter(Boolean).join(" · ") || "—"}
                    </div>
                  </div>
                  {/* Stats badges */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    {c.ac != null && (
                      <span className="flex items-center gap-0.5 text-[10px] text-blue-400 bg-blue-900/30 border border-blue-800/30 rounded px-1 py-0.5">
                        <Shield className="w-2.5 h-2.5" />{c.ac}
                      </span>
                    )}
                    {c.hp != null && (
                      <span className="flex items-center gap-0.5 text-[10px] text-red-400 bg-red-900/30 border border-red-800/30 rounded px-1 py-0.5">
                        <Heart className="w-2.5 h-2.5" />{c.hp}
                      </span>
                    )}
                  </div>
                  {/* Action buttons */}
                  <div className="flex items-center gap-0.5 shrink-0">
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
                    <span className="text-[10px] text-purple-400 shrink-0">Initiative roll:</span>
                    <input type="number" autoFocus value={initiativeVal}
                      onChange={e => setInitiativeVal(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter" && !isImeComposing(e)) addToInitiative(c); }}
                      placeholder="e.g. 14"
                      className="w-16 px-1.5 py-0.5 bg-gray-900 border border-purple-700 rounded text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-purple-500" />
                    <button onClick={() => addToInitiative(c)}
                      className="flex items-center gap-0.5 px-2 py-0.5 bg-purple-700 hover:bg-purple-600 rounded text-[10px] text-white font-semibold transition-colors">
                      <Check className="w-3 h-3" />Add
                    </button>
                    <button onClick={() => setInitiativeFor(null)} className="text-gray-600 hover:text-gray-400">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                )}

                {/* Weapons + spells detail row */}
                {((c.weapons?.length ?? 0) > 0 || (c.spells?.length ?? 0) > 0) && (
                  <div className="px-2 py-1.5 border-t border-gray-800/40 space-y-1">
                    {(c.weapons?.length ?? 0) > 0 && (
                      <div className="flex items-start gap-1 flex-wrap">
                        {c.weapons.map(w => (
                          <WeaponPill key={w} name={w} statsMap={weaponStats} />
                        ))}
                      </div>
                    )}
                    {(c.spells?.length ?? 0) > 0 && (
                      <div className="flex items-start gap-1 flex-wrap">
                        {c.spells.map(s => (
                          <SpellPill key={s} name={s} statsMap={spellStats} />
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
