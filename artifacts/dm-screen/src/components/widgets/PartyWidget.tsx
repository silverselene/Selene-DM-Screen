import { useState, useEffect, useCallback, useRef } from "react";
import {
  Users, Plus, Trash2, Pencil, Check, X, Swords, Shield,
  Heart, Star, BookOpen, Sword, Search,
} from "lucide-react";
import type { PlayerCharacter, Combatant } from "@/types";

const API = "/api/characters";
const WEAPONS_SEARCH = "/api/weapons/search";
const WEAPONS_BY_NAMES = "/api/weapons/by-names";

let idCounter = Date.now();
const nextId = () => String(++idCounter);

// ── Weapon summary from API ────────────────────────────────────────────────
interface WeaponInfo {
  id: number;
  name: string;
  category: string | null;
  damage: string | null;
  damage_type: string | null;
  properties: string[];
  cost: string | null;
  weight: string | null;
}

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
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (!query.trim()) { setSuggestions([]); setOpen(false); return; }
    timer.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`${WEAPONS_SEARCH}?q=${encodeURIComponent(query)}&limit=10`);
        if (res.ok) {
          const data: WeaponInfo[] = await res.json();
          // filter out already-selected
          setSuggestions(data.filter(w => !selected.map(s => s.toLowerCase()).includes(w.name.toLowerCase())));
          setOpen(true);
        }
      } catch { /* silent */ } finally { setLoading(false); }
    }, 200);
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

  return (
    <div className="relative">
      {/* Tags + input row */}
      <div
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
            if (e.key === "Enter") { e.preventDefault(); if (query.trim()) add(query.trim()); }
            if (e.key === "Backspace" && !query && selected.length) remove(selected[selected.length - 1]);
            if (e.key === "Escape") { setOpen(false); setQuery(""); }
          }}
          onFocus={() => query && setSuggestions(s => s)}
          placeholder={selected.length === 0 ? "Search or type a weapon…" : "Add more…"}
          className={inputCls}
        />
        {loading && <Search className="w-3 h-3 text-gray-600 self-center animate-pulse" />}
      </div>

      {/* Dropdown suggestions */}
      {open && suggestions.length > 0 && (
        <div className="absolute z-50 left-0 right-0 top-full mt-0.5 bg-gray-900 border border-gray-700 rounded shadow-xl max-h-48 overflow-y-auto">
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
          {/* Allow adding the typed name even if it appears in results */}
          {query && !suggestions.some(s => s.name.toLowerCase() === query.toLowerCase()) && (
            <button
              type="button"
              onMouseDown={e => { e.preventDefault(); add(query); }}
              className="w-full flex items-center gap-1.5 px-2 py-1.5 text-left hover:bg-gray-800 border-t border-gray-800 text-gray-500 text-xs"
            >
              <Plus className="w-3 h-3" />Add "{query}" as custom weapon
            </button>
          )}
        </div>
      )}
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

// ── emptyForm with weapons as array ───────────────────────────────────────
const emptyForm = () => ({
  name: "", race: "", class: "", level: "1",
  ac: "", hp: "", spells: "",
  weapons: [] as string[],
});

// ── Main widget ────────────────────────────────────────────────────────────
export function PartyWidget() {
  const [characters, setCharacters] = useState<PlayerCharacter[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState(emptyForm());

  // Weapon stats map: lowercase name → WeaponInfo
  const [weaponStats, setWeaponStats] = useState<Map<string, WeaponInfo>>(new Map());

  // Per-row initiative
  const [initiativeFor, setInitiativeFor] = useState<number | null>(null);
  const [initiativeVal, setInitiativeVal] = useState("");

  // ── Load characters ──────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(API);
      if (!res.ok) throw new Error("Failed to load");
      const data: PlayerCharacter[] = await res.json();
      const parsed = data.map(c => ({
        ...c,
        spells: Array.isArray(c.spells) ? c.spells : [],
        weapons: Array.isArray(c.weapons) ? c.weapons : [],
      }));
      setCharacters(parsed);

      // Batch-resolve all weapon names to stats
      const allNames = [...new Set(parsed.flatMap(c => c.weapons))];
      if (allNames.length) {
        const wr = await fetch(WEAPONS_BY_NAMES, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ names: allNames }),
        });
        if (wr.ok) {
          const wdata: WeaponInfo[] = await wr.json();
          setWeaponStats(new Map(wdata.map(w => [w.name.toLowerCase(), w])));
        }
      }
    } catch {
      setError("Could not reach the server.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Save new character ───────────────────────────────────────────────────
  const save = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const body = {
        name: form.name.trim(),
        race: form.race.trim() || null,
        class: form.class.trim() || null,
        level: parseInt(form.level) || 1,
        ac: form.ac ? parseInt(form.ac) : null,
        hp: form.hp ? parseInt(form.hp) : null,
        spells: form.spells.split(",").map(s => s.trim()).filter(Boolean),
        weapons: form.weapons,
      };
      const res = await fetch(API, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error();
      setForm(emptyForm()); setShowAdd(false);
      await load();
    } catch { setError("Failed to save."); } finally { setSaving(false); }
  };

  // ── Save edit ────────────────────────────────────────────────────────────
  const saveEdit = async () => {
    if (editingId === null || !editForm.name.trim()) return;
    setSaving(true);
    try {
      const body = {
        name: editForm.name.trim(),
        race: editForm.race.trim() || null,
        class: editForm.class.trim() || null,
        level: parseInt(editForm.level) || 1,
        ac: editForm.ac ? parseInt(editForm.ac) : null,
        hp: editForm.hp ? parseInt(editForm.hp) : null,
        spells: editForm.spells.split(",").map(s => s.trim()).filter(Boolean),
        weapons: editForm.weapons,
      };
      const res = await fetch(`${API}/${editingId}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error();
      setEditingId(null);
      await load();
    } catch { setError("Failed to update."); } finally { setSaving(false); }
  };

  const deleteChar = async (id: number) => {
    try {
      await fetch(`${API}/${id}`, { method: "DELETE" });
      setCharacters(prev => prev.filter(c => c.id !== id));
    } catch { setError("Failed to delete."); }
  };

  const startEdit = (c: PlayerCharacter) => {
    setEditingId(c.id);
    setEditForm({
      name: c.name, race: c.race || "", class: c.class || "",
      level: String(c.level), ac: c.ac != null ? String(c.ac) : "",
      hp: c.hp != null ? String(c.hp) : "",
      spells: (c.spells || []).join(", "),
      weapons: c.weapons || [],
    });
  };

  const addToInitiative = (c: PlayerCharacter) => {
    const combatant: Combatant = {
      id: nextId(), name: c.name,
      initiative: parseInt(initiativeVal) || 0,
      hp: c.hp || 0, maxHp: c.hp || 0,
      ac: c.ac ?? undefined, isPlayer: true,
    };
    window.dispatchEvent(new CustomEvent("dm-add-to-initiative", { detail: { combatant } }));
    setInitiativeFor(null); setInitiativeVal("");
  };

  const inputCls = "w-full px-2 py-1 bg-gray-900 border border-gray-700 rounded text-xs text-gray-200 placeholder-gray-500 focus:outline-none focus:border-purple-500";

  // ── Shared form fields ───────────────────────────────────────────────────
  const FormFields = ({
    f, setF,
  }: { f: typeof form; setF: (v: typeof form) => void }) => (
    <div className="space-y-1.5">
      <input placeholder="Name *" value={f.name}
        onChange={e => setF({ ...f, name: e.target.value })} className={inputCls} />
      <div className="flex gap-1">
        <input placeholder="Race" value={f.race}
          onChange={e => setF({ ...f, race: e.target.value })} className={`${inputCls} flex-1`} />
        <input placeholder="Class" value={f.class}
          onChange={e => setF({ ...f, class: e.target.value })} className={`${inputCls} flex-1`} />
      </div>
      <div className="flex gap-1">
        <input placeholder="Level" type="number" min="1" max="20" value={f.level}
          onChange={e => setF({ ...f, level: e.target.value })}
          className={`${inputCls} w-16 shrink-0`} />
        <input placeholder="AC" type="number" value={f.ac}
          onChange={e => setF({ ...f, ac: e.target.value })} className={`${inputCls} flex-1`} />
        <input placeholder="Max HP" type="number" value={f.hp}
          onChange={e => setF({ ...f, hp: e.target.value })} className={`${inputCls} flex-1`} />
      </div>
      {/* Weapons — searchable tag input */}
      <div>
        <label className="text-[10px] text-gray-500 block mb-0.5">Weapons</label>
        <WeaponTagInput
          selected={f.weapons}
          onChange={weapons => setF({ ...f, weapons })}
        />
      </div>
      <input placeholder="Spells (comma-separated)" value={f.spells}
        onChange={e => setF({ ...f, spells: e.target.value })} className={inputCls} />
    </div>
  );

  return (
    <div className="h-full min-h-0 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-2 shrink-0">
        <span className="text-xs text-gray-400">
          {characters.length} character{characters.length !== 1 ? "s" : ""}
        </span>
        <button
          onClick={() => { setShowAdd(v => !v); setForm(emptyForm()); }}
          className="flex items-center gap-1 text-xs px-2 py-1 bg-emerald-900/40 hover:bg-emerald-800/50 rounded text-emerald-400 transition-colors"
        >
          <Plus className="w-3 h-3" />Add Character
        </button>
      </div>

      {error && (
        <div className="text-xs text-red-400 bg-red-900/20 border border-red-800/40 rounded px-2 py-1 mb-2 shrink-0">
          {error}
        </div>
      )}

      {/* Add form */}
      {showAdd && (
        <div className="mb-2 p-2 bg-gray-900/80 border border-emerald-700/40 rounded shrink-0">
          <p className="text-xs font-semibold text-emerald-400 mb-2">New Character</p>
          <FormFields f={form} setF={setForm} />
          <div className="flex gap-1 mt-2">
            <button onClick={save} disabled={saving || !form.name.trim()}
              className="flex-1 py-1 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 rounded text-xs text-white font-semibold transition-colors">
              {saving ? "Saving…" : "Save Character"}
            </button>
            <button onClick={() => setShowAdd(false)}
              className="px-2 py-1 bg-gray-800 hover:bg-gray-700 rounded text-xs text-gray-400 transition-colors">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Character list */}
      <div className="flex-1 min-h-0 overflow-y-auto space-y-1.5">
        {loading && <div className="text-center py-4 text-gray-500 text-xs">Loading…</div>}

        {!loading && characters.length === 0 && !showAdd && (
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
                  <button onClick={saveEdit} disabled={saving}
                    className="flex-1 py-1 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 rounded text-xs text-white font-semibold">
                    {saving ? "Saving…" : "Save"}
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
                      className="w-6 h-6 flex items-center justify-center text-gray-500 hover:text-gray-300 hover:bg-gray-700/40 rounded transition-colors">
                      <Pencil className="w-3 h-3" />
                    </button>
                    <button onClick={() => deleteChar(c.id)}
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
                      onKeyDown={e => e.key === "Enter" && addToInitiative(c)}
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
                      <div className="flex items-start gap-1">
                        <BookOpen className="w-2.5 h-2.5 text-cyan-600 mt-0.5 shrink-0" />
                        <span className="text-[10px] text-gray-500 leading-tight">{c.spells.join(", ")}</span>
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
