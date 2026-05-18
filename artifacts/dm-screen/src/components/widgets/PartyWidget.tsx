import { useState, useEffect, useCallback } from "react";
import {
  Users, Plus, Trash2, Pencil, Check, X, Swords, Shield,
  Heart, Star, BookOpen, Sword,
} from "lucide-react";
import type { PlayerCharacter, Combatant } from "@/types";

const API = "/api/characters";

let idCounter = Date.now();
const nextId = () => String(++idCounter);

const emptyForm = () => ({
  name: "", race: "", class: "", level: "1",
  ac: "", hp: "", spells: "", weapons: "",
});

export function PartyWidget() {
  const [characters, setCharacters] = useState<PlayerCharacter[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState(emptyForm());

  // Per-row initiative input for "Add to Initiative"
  const [initiativeFor, setInitiativeFor] = useState<number | null>(null);
  const [initiativeVal, setInitiativeVal] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(API);
      if (!res.ok) throw new Error("Failed to load");
      const data = await res.json();
      setCharacters(data.map((c: PlayerCharacter) => ({
        ...c,
        spells: Array.isArray(c.spells) ? c.spells : [],
        weapons: Array.isArray(c.weapons) ? c.weapons : [],
      })));
    } catch {
      setError("Could not reach the server.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

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
        weapons: form.weapons.split(",").map(s => s.trim()).filter(Boolean),
      };
      const res = await fetch(API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error();
      setForm(emptyForm());
      setShowAdd(false);
      await load();
    } catch {
      setError("Failed to save.");
    } finally {
      setSaving(false);
    }
  };

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
        weapons: editForm.weapons.split(",").map(s => s.trim()).filter(Boolean),
      };
      const res = await fetch(`${API}/${editingId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error();
      setEditingId(null);
      await load();
    } catch {
      setError("Failed to update.");
    } finally {
      setSaving(false);
    }
  };

  const deleteChar = async (id: number) => {
    try {
      await fetch(`${API}/${id}`, { method: "DELETE" });
      setCharacters(prev => prev.filter(c => c.id !== id));
    } catch {
      setError("Failed to delete.");
    }
  };

  const startEdit = (c: PlayerCharacter) => {
    setEditingId(c.id);
    setEditForm({
      name: c.name,
      race: c.race || "",
      class: c.class || "",
      level: String(c.level),
      ac: c.ac != null ? String(c.ac) : "",
      hp: c.hp != null ? String(c.hp) : "",
      spells: (c.spells || []).join(", "),
      weapons: (c.weapons || []).join(", "),
    });
  };

  const addToInitiative = (c: PlayerCharacter) => {
    const initiative = parseInt(initiativeVal) || 0;
    const combatant: Combatant = {
      id: nextId(),
      name: c.name,
      initiative,
      hp: c.hp || 0,
      maxHp: c.hp || 0,
      ac: c.ac ?? undefined,
      isPlayer: true,
    };
    window.dispatchEvent(
      new CustomEvent("dm-add-to-initiative", { detail: { combatant } })
    );
    setInitiativeFor(null);
    setInitiativeVal("");
  };

  const inputCls = "w-full px-2 py-1 bg-gray-900 border border-gray-700 rounded text-xs text-gray-200 placeholder-gray-500 focus:outline-none focus:border-purple-500";

  const FormFields = ({ f, setF }: { f: typeof form; setF: (v: typeof form) => void }) => (
    <div className="space-y-1.5">
      <input placeholder="Name *" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} className={inputCls} />
      <div className="flex gap-1">
        <input placeholder="Race" value={f.race} onChange={e => setF({ ...f, race: e.target.value })} className={`${inputCls} flex-1`} />
        <input placeholder="Class" value={f.class} onChange={e => setF({ ...f, class: e.target.value })} className={`${inputCls} flex-1`} />
      </div>
      <div className="flex gap-1">
        <input placeholder="Level" type="number" min="1" max="20" value={f.level} onChange={e => setF({ ...f, level: e.target.value })} className={`${inputCls} w-16 shrink-0`} />
        <input placeholder="AC" type="number" value={f.ac} onChange={e => setF({ ...f, ac: e.target.value })} className={`${inputCls} flex-1`} />
        <input placeholder="Max HP" type="number" value={f.hp} onChange={e => setF({ ...f, hp: e.target.value })} className={`${inputCls} flex-1`} />
      </div>
      <input placeholder="Weapons (comma-separated)" value={f.weapons} onChange={e => setF({ ...f, weapons: e.target.value })} className={inputCls} />
      <input placeholder="Spells (comma-separated)" value={f.spells} onChange={e => setF({ ...f, spells: e.target.value })} className={inputCls} />
    </div>
  );

  return (
    <div className="h-full min-h-0 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-2 shrink-0">
        <span className="text-xs text-gray-400">{characters.length} character{characters.length !== 1 ? "s" : ""}</span>
        <button
          onClick={() => { setShowAdd(v => !v); setForm(emptyForm()); }}
          className="flex items-center gap-1 text-xs px-2 py-1 bg-emerald-900/40 hover:bg-emerald-800/50 rounded text-emerald-400 transition-colors"
        >
          <Plus className="w-3 h-3" />
          Add Character
        </button>
      </div>

      {error && (
        <div className="text-xs text-red-400 bg-red-900/20 border border-red-800/40 rounded px-2 py-1 mb-2 shrink-0">{error}</div>
      )}

      {/* Add form */}
      {showAdd && (
        <div className="mb-2 p-2 bg-gray-900/80 border border-emerald-700/40 rounded shrink-0">
          <p className="text-xs font-semibold text-emerald-400 mb-2">New Character</p>
          <FormFields f={form} setF={setForm} />
          <div className="flex gap-1 mt-2">
            <button
              onClick={save}
              disabled={saving || !form.name.trim()}
              className="flex-1 py-1 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 rounded text-xs text-white font-semibold transition-colors"
            >
              {saving ? "Saving…" : "Save Character"}
            </button>
            <button onClick={() => setShowAdd(false)} className="px-2 py-1 bg-gray-800 hover:bg-gray-700 rounded text-xs text-gray-400 transition-colors">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Character list */}
      <div className="flex-1 min-h-0 overflow-y-auto space-y-1.5">
        {loading && (
          <div className="text-center py-4 text-gray-500 text-xs">Loading…</div>
        )}
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
              /* ── Edit mode ── */
              <div className="p-2">
                <FormFields f={editForm} setF={setEditForm} />
                <div className="flex gap-1 mt-2">
                  <button onClick={saveEdit} disabled={saving} className="flex-1 py-1 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 rounded text-xs text-white font-semibold">
                    {saving ? "Saving…" : "Save"}
                  </button>
                  <button onClick={() => setEditingId(null)} className="px-2 py-1 bg-gray-800 hover:bg-gray-700 rounded text-xs text-gray-400">
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              /* ── View mode ── */
              <>
                <div className="flex items-center gap-2 px-2 py-1.5">
                  {/* Name + class/race */}
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

                  {/* Stats */}
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

                  {/* Actions */}
                  <div className="flex items-center gap-0.5 shrink-0">
                    <button
                      onClick={() => { setInitiativeFor(initiativeFor === c.id ? null : c.id); setInitiativeVal(""); }}
                      title="Add to Initiative"
                      className="w-6 h-6 flex items-center justify-center text-purple-500 hover:text-purple-300 hover:bg-purple-900/30 rounded transition-colors"
                    >
                      <Swords className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => startEdit(c)} className="w-6 h-6 flex items-center justify-center text-gray-500 hover:text-gray-300 hover:bg-gray-700/40 rounded transition-colors">
                      <Pencil className="w-3 h-3" />
                    </button>
                    <button onClick={() => deleteChar(c.id)} className="w-6 h-6 flex items-center justify-center text-gray-600 hover:text-red-400 hover:bg-red-900/20 rounded transition-colors">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>

                {/* Initiative quick-add row */}
                {initiativeFor === c.id && (
                  <div className="flex items-center gap-1.5 px-2 py-1.5 bg-purple-900/20 border-t border-purple-800/30">
                    <span className="text-[10px] text-purple-400 shrink-0">Initiative roll:</span>
                    <input
                      type="number"
                      autoFocus
                      value={initiativeVal}
                      onChange={e => setInitiativeVal(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && addToInitiative(c)}
                      placeholder="e.g. 14"
                      className="w-16 px-1.5 py-0.5 bg-gray-900 border border-purple-700 rounded text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-purple-500"
                    />
                    <button
                      onClick={() => addToInitiative(c)}
                      className="flex items-center gap-0.5 px-2 py-0.5 bg-purple-700 hover:bg-purple-600 rounded text-[10px] text-white font-semibold transition-colors"
                    >
                      <Check className="w-3 h-3" />Add
                    </button>
                    <button onClick={() => setInitiativeFor(null)} className="text-gray-600 hover:text-gray-400">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                )}

                {/* Weapons & spells */}
                {((c.weapons?.length ?? 0) > 0 || (c.spells?.length ?? 0) > 0) && (
                  <div className="px-2 py-1 border-t border-gray-800/40 space-y-0.5">
                    {(c.weapons?.length ?? 0) > 0 && (
                      <div className="flex items-start gap-1">
                        <Sword className="w-2.5 h-2.5 text-amber-600 mt-0.5 shrink-0" />
                        <span className="text-[10px] text-gray-500 leading-tight">{c.weapons.join(", ")}</span>
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
