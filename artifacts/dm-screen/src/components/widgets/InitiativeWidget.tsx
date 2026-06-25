import { useState, useEffect, useRef } from "react";
import {
  Plus, Trash2, ChevronDown, ChevronUp, Swords,
  SkipForward, RotateCcw, Search, Skull, User, Shield, ExternalLink, Users,
} from "lucide-react";
import type { Combatant, PlayerCharacter } from "@/types";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { useParty } from "@/lib/partyStore";
import { searchMonsters, type MonsterSearchHit } from "@/lib/monsterSearch";

let idCounter = Date.now();
const nextId = () => String(++idCounter);

// Display shape for monster search results. Same fields the old API row had
// (keeps the rendering JSX untouched), now sourced from the local index.
interface MonsterSummary {
  id: string;
  name: string;
  size: string;
  type: string;
  ac: number;
  ac_type: string;
  hp: string;
  cr: string;
  source?: string;
  is_legendary?: boolean;
  initiative_modifier?: number;
}

function hitToSummary(h: MonsterSearchHit): MonsterSummary {
  return {
    id: h.id,
    name: h.name,
    size: h.size,
    type: h.type,
    ac: h.ac,
    ac_type: h.acType,
    hp: h.hp,
    cr: h.cr,
    source: h.source,
    is_legendary: h.isLegendary,
    initiative_modifier: h.initiativeModifier,
  };
}

function parseMaxHp(hpStr: string): number {
  const m = hpStr.match(/^(\d+)/);
  return m ? parseInt(m[1]) : 10;
}

// Read an older unversioned key once, so a DM with an encounter in progress
// at upgrade time keeps the in-flight combat state across the version bump.
function readLegacy<T>(legacyKey: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(legacyKey);
    if (raw == null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

type AddMode = "player" | "monster" | "party";

export function InitiativeWidget() {
  // Versioned per phase 2 ("Persist live combat state to a versioned key").
  // Older unversioned keys (dm-initiative / dm-initiative-turn / dm-round)
  // are read once for backward compatibility if the user already had an
  // encounter in progress before this migration.
  const [combatants, setCombatants] = useLocalStorage<Combatant[]>(
    "dm-initiative-v1",
    () => readLegacy<Combatant[]>("dm-initiative", []),
  );
  const [currentIndex, setCurrentIndex] = useLocalStorage<number>(
    "dm-initiative-turn-v1",
    () => readLegacy<number>("dm-initiative-turn", 0),
  );
  const [round, setRound] = useLocalStorage<number>(
    "dm-round-v1",
    () => readLegacy<number>("dm-round", 1),
  );
  const [showForm, setShowForm] = useState(false);
  // Persist the last-used Add tab — the DM tends to add the same kind of
  // combatant repeatedly in a given session.
  const [addMode, setAddMode] = useLocalStorage<AddMode>("dm-initiative-mode-v1", "player");

  // Player/custom form
  // Custom-combatant form. Initiative is pre-rolled with a fresh d20 each
  // time the form is opened or after a successful add, so the DM doesn't
  // have to roll a die just to type a number; they can still override.
  const rollD20 = () => Math.floor(Math.random() * 20) + 1;
  const freshForm = () => ({
    name: "",
    initiative: String(rollD20()),
    hp: "",
    ac: "",
    isPlayer: false,
  });
  const [form, setForm] = useState(freshForm);

  // Monster search
  const [monsterQuery, setMonsterQuery] = useState("");
  const [monsterResults, setMonsterResults] = useState<MonsterSummary[]>([]);
  const [selectedMonster, setSelectedMonster] = useState<MonsterSummary | null>(null);
  // Three independent fields: the raw d20 the DM rolled, the final initiative
  // (auto = d20 + DEX mod, but DM-editable to override), and an HP override.
  const [monsterD20Roll, setMonsterD20Roll] = useState("");
  const [monsterInitiative, setMonsterInitiative] = useState("");
  const [monsterHpOverride, setMonsterHpOverride] = useState("");
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Party tab — sourced from the shared store. useParty re-renders on writes.
  const partyChars = useParty();
  const [selectedPc, setSelectedPc] = useState<PlayerCharacter | null>(null);
  const [pcInitiative, setPcInitiative] = useState("");

  const sorted = [...combatants].sort((a, b) => b.initiative - a.initiative);

  // ── Listen for dm-add-to-initiative events from PartyWidget ──
  useEffect(() => {
    const handler = (e: Event) => {
      const combatant = (e as CustomEvent<{ combatant: Combatant }>).detail?.combatant;
      if (!combatant) return;
      setCombatants(prev =>
        [...prev, combatant].sort((a, b) => b.initiative - a.initiative)
      );
    };
    window.addEventListener("dm-add-to-initiative", handler);
    return () => window.removeEventListener("dm-add-to-initiative", handler);
  }, [setCombatants]);

  // ── Monster search (local index, debounced) ──
  useEffect(() => {
    if (addMode !== "monster") return;
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!monsterQuery.trim()) { setMonsterResults([]); return; }
    searchTimer.current = setTimeout(() => {
      setMonsterResults(searchMonsters(monsterQuery).map(hitToSummary));
    }, 80);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [monsterQuery, addMode]);

  const selectMonster = (m: MonsterSummary) => {
    setSelectedMonster(m);
    setMonsterHpOverride(String(parseMaxHp(m.hp)));
    setMonsterResults([]);
    setMonsterQuery(m.name);
    // Auto-roll initiative for the DM: 1d20 in the left box, (d20 + DEX
    // mod) in the middle box. Either is freely editable.
    const mod = m.initiative_modifier ?? 0;
    const d20 = Math.floor(Math.random() * 20) + 1;
    setMonsterD20Roll(String(d20));
    setMonsterInitiative(String(d20 + mod));
  };

  // When the DM types a new d20 result, recompute the resulting initiative
  // automatically. Manual edits to the initiative field after this still
  // win (this only fires on d20 changes).
  const updateD20 = (v: string) => {
    setMonsterD20Roll(v);
    const roll = parseInt(v);
    if (Number.isFinite(roll)) {
      const mod = selectedMonster?.initiative_modifier ?? 0;
      setMonsterInitiative(String(roll + mod));
    }
  };

  // ── Add combatant helpers ──
  const addPlayer = () => {
    if (!form.name.trim()) return;
    const newC: Combatant = {
      id: nextId(), name: form.name.trim(),
      initiative: parseInt(form.initiative) || 0,
      hp: parseInt(form.hp) || 0, maxHp: parseInt(form.hp) || 0,
      ac: form.ac ? parseInt(form.ac) : undefined,
      isPlayer: form.isPlayer,
    };
    setCombatants([...combatants, newC].sort((a, b) => b.initiative - a.initiative));
    setForm(freshForm());
    setShowForm(false);
  };

  const addMonster = () => {
    if (!selectedMonster) return;
    const hp = parseInt(monsterHpOverride) || parseMaxHp(selectedMonster.hp);
    const newC: Combatant = {
      id: nextId(), name: selectedMonster.name,
      initiative: parseInt(monsterInitiative) || 0,
      hp, maxHp: hp, ac: selectedMonster.ac, isPlayer: false,
    };
    setCombatants([...combatants, newC].sort((a, b) => b.initiative - a.initiative));
    setSelectedMonster(null); setMonsterQuery("");
    setMonsterD20Roll(""); setMonsterInitiative(""); setMonsterHpOverride("");
    setShowForm(false);
  };

  const addFromParty = () => {
    if (!selectedPc) return;
    const newC: Combatant = {
      id: nextId(), name: selectedPc.name,
      initiative: parseInt(pcInitiative) || 0,
      hp: selectedPc.hp || 0, maxHp: selectedPc.hp || 0,
      ac: selectedPc.ac ?? undefined, isPlayer: true,
    };
    setCombatants([...combatants, newC].sort((a, b) => b.initiative - a.initiative));
    setSelectedPc(null); setPcInitiative("");
    setShowForm(false);
  };

  const removeCombatant = (id: string) => {
    const next = combatants.filter((c) => c.id !== id);
    setCombatants(next.sort((a, b) => b.initiative - a.initiative));
    if (currentIndex >= next.length && next.length > 0) setCurrentIndex(next.length - 1);
  };

  const updateHp = (id: string, delta: number) => {
    setCombatants(combatants.map((c) => c.id === id ? { ...c, hp: Math.max(0, c.hp + delta) } : c));
  };

  const nextTurn = () => {
    if (sorted.length === 0) return;
    const next = (currentIndex + 1) % sorted.length;
    if (next === 0) setRound((r) => r + 1);
    setCurrentIndex(next);
  };

  const reset = () => { setCombatants([]); setCurrentIndex(0); setRound(1); };

  const inputCls = "px-2 py-1 bg-gray-800 border border-gray-600 rounded text-xs text-gray-200 placeholder-gray-500 focus:outline-none focus:border-purple-500";

  return (
    <div className="h-full min-h-0 flex flex-col">
      {/* ── Top bar ── */}
      <div className="flex items-center justify-between mb-2 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-xs text-purple-400">Round</span>
          <span className="text-sm font-bold text-white">{round}</span>
        </div>
        <div className="flex gap-1">
          <button onClick={nextTurn} disabled={sorted.length === 0}
            className="flex items-center gap-1 text-xs px-2 py-1 bg-purple-800/50 hover:bg-purple-700/60 disabled:opacity-40 rounded transition-colors text-purple-200">
            <SkipForward className="w-3 h-3" />Next
          </button>
          <button
            onClick={() => {
              setShowForm((v) => {
                // Re-roll a fresh initiative each time the form is opened
                // (and only if the DM hasn't already typed something in).
                if (!v) {
                  setForm((f) =>
                    f.name === "" && (f.hp === "" || f.hp === undefined) && (f.ac === "" || f.ac === undefined)
                      ? freshForm()
                      : f,
                  );
                }
                return !v;
              });
            }}
            className="flex items-center gap-1 text-xs px-2 py-1 bg-gray-700/60 hover:bg-gray-600/60 rounded transition-colors text-gray-300">
            <Plus className="w-3 h-3" />
          </button>
          <button onClick={reset}
            className="flex items-center gap-1 text-xs px-2 py-1 bg-red-900/40 hover:bg-red-800/50 rounded transition-colors text-red-400">
            <RotateCcw className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* ── Add form ── */}
      {showForm && (
        <div className="mb-2 p-2 bg-gray-900/80 border border-purple-700/40 rounded shrink-0">
          {/* Mode tabs */}
          <div className="flex gap-1 mb-2">
            <button onClick={() => setAddMode("player")}
              className={`flex-1 flex items-center justify-center gap-1 py-1 text-xs rounded border transition-all ${
                addMode === "player" ? "bg-green-900/50 border-green-700 text-green-300" : "bg-gray-800 border-gray-700 text-gray-500 hover:border-gray-600"}`}>
              <User className="w-3 h-3" />Custom
            </button>
            <button onClick={() => setAddMode("party")}
              className={`flex-1 flex items-center justify-center gap-1 py-1 text-xs rounded border transition-all ${
                addMode === "party" ? "bg-emerald-900/50 border-emerald-700 text-emerald-300" : "bg-gray-800 border-gray-700 text-gray-500 hover:border-gray-600"}`}>
              <Users className="w-3 h-3" />Party
            </button>
            <button onClick={() => setAddMode("monster")}
              className={`flex-1 flex items-center justify-center gap-1 py-1 text-xs rounded border transition-all ${
                addMode === "monster" ? "bg-rose-900/50 border-rose-700 text-rose-300" : "bg-gray-800 border-gray-700 text-gray-500 hover:border-gray-600"}`}>
              <Skull className="w-3 h-3" />Monster
            </button>
          </div>

          {addMode === "player" && (
            <div className="space-y-1.5">
              <input placeholder="Name" value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                onKeyDown={(e) => e.key === "Enter" && addPlayer()}
                className={`w-full ${inputCls}`} />
              <div className="flex gap-1">
                <div className="w-1/3">
                  <label className="text-[10px] text-gray-500 block mb-0.5">Initiative</label>
                  <input type="number" value={form.initiative}
                    onChange={(e) => setForm({ ...form, initiative: e.target.value })} className={`w-full ${inputCls}`} />
                </div>
                <div className="w-1/3">
                  <label className="text-[10px] text-gray-500 block mb-0.5">HP</label>
                  <input type="number" value={form.hp}
                    onChange={(e) => setForm({ ...form, hp: e.target.value })} className={`w-full ${inputCls}`} />
                </div>
                <div className="w-1/3">
                  <label className="text-[10px] text-gray-500 block mb-0.5">AC</label>
                  <input type="number" value={form.ac}
                    onChange={(e) => setForm({ ...form, ac: e.target.value })} className={`w-full ${inputCls}`} />
                </div>
              </div>
              <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer">
                <input type="checkbox" checked={form.isPlayer}
                  onChange={(e) => setForm({ ...form, isPlayer: e.target.checked })} className="accent-purple-500" />
                Player Character
              </label>
              <button onClick={addPlayer}
                className="w-full py-1 bg-purple-700 hover:bg-purple-600 rounded text-xs text-white font-semibold transition-colors">
                Add to Initiative
              </button>
            </div>
          )}

          {addMode === "party" && (
            <div className="space-y-1.5">
              {partyChars.length === 0 && (
                <p className="text-xs text-gray-500 text-center py-2">No characters saved yet — add them in the Party widget.</p>
              )}
              {partyChars.length > 0 && (
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {partyChars.map(pc => (
                    <button key={pc.id} onClick={() => { setSelectedPc(pc); setPcInitiative(""); }}
                      className={`w-full flex items-center gap-2 px-2 py-1.5 rounded border text-left transition-all ${
                        selectedPc?.id === pc.id
                          ? "bg-emerald-900/50 border-emerald-600"
                          : "bg-gray-800/60 border-gray-700 hover:border-emerald-700/50"}`}>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold text-gray-100 truncate">{pc.name}</div>
                        <div className="text-[10px] text-gray-500">{[pc.race, pc.class, pc.level ? `Lv ${pc.level}` : null].filter(Boolean).join(" · ")}</div>
                      </div>
                      {pc.ac != null && (
                        <span className="text-[10px] text-blue-400 flex items-center gap-0.5 shrink-0">
                          <Shield className="w-2.5 h-2.5" />{pc.ac}
                        </span>
                      )}
                      {pc.hp != null && (
                        <span className="text-[10px] text-red-400 shrink-0">{pc.hp}hp</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
              {selectedPc && (
                <div className="flex gap-1 items-center">
                  <span className="text-xs text-emerald-400 shrink-0">Initiative for {selectedPc.name}:</span>
                  <input autoFocus placeholder="Roll" type="number" value={pcInitiative}
                    onChange={(e) => setPcInitiative(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addFromParty()}
                    className={`w-20 ${inputCls}`} />
                </div>
              )}
              <button onClick={addFromParty} disabled={!selectedPc}
                className="w-full py-1 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 rounded text-xs text-white font-semibold transition-colors">
                Add {selectedPc ? selectedPc.name : "Party Member"} to Initiative
              </button>
            </div>
          )}

          {addMode === "monster" && (
            <div className="space-y-1.5">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-purple-400" />
                <input placeholder="Search monsters…" value={monsterQuery}
                  onChange={(e) => { setMonsterQuery(e.target.value); setSelectedMonster(null); }}
                  className={`w-full pl-6 pr-2 py-1 bg-gray-800 border border-gray-600 rounded text-xs text-gray-200 placeholder-gray-500 focus:outline-none focus:border-rose-500`} />
              </div>
              {monsterResults.length > 0 && !selectedMonster && (
                <div className="max-h-36 overflow-y-auto rounded border border-gray-700 bg-gray-900 divide-y divide-gray-800">
                  {monsterResults.map((m) => (
                    <button key={m.id} onClick={() => selectMonster(m)}
                      className="w-full text-left px-2 py-1 text-xs hover:bg-rose-900/30 transition-colors">
                      <div className="flex items-center gap-1">
                        <span className="text-gray-200 font-medium">{m.name}</span>
                        {m.is_legendary && <span className="text-[9px] text-amber-400 border border-amber-700/50 rounded px-0.5 leading-tight">LEG</span>}
                        {m.source && <span className="text-[9px] text-gray-600 ml-auto shrink-0">{m.source}</span>}
                      </div>
                      <div className="text-gray-500 mt-0.5">
                        {[m.size, m.type].filter(Boolean).join(" ")} · CR {m.cr} · AC {m.ac} · {m.hp.split(" ")[0]} HP
                      </div>
                    </button>
                  ))}
                </div>
              )}
              {selectedMonster && (
                <div className="bg-rose-950/30 border border-rose-800/40 rounded px-2 py-1.5 text-xs">
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="font-semibold text-rose-300">{selectedMonster.name}</span>
                    {selectedMonster.is_legendary && <span className="text-[9px] text-amber-400 border border-amber-700/50 rounded px-1 leading-tight">LEGENDARY</span>}
                    {selectedMonster.source && <span className="text-[9px] text-gray-500 ml-auto">{selectedMonster.source}</span>}
                  </div>
                  <div className="text-gray-400 flex flex-wrap gap-x-3 gap-y-0.5">
                    <span>CR {selectedMonster.cr}</span>
                    <span className="flex items-center gap-0.5"><Shield className="w-3 h-3" />{selectedMonster.ac}{selectedMonster.ac_type && ` (${selectedMonster.ac_type})`}</span>
                    <span>HP {selectedMonster.hp}</span>
                    {selectedMonster.initiative_modifier != null && (
                      <span title="Initiative modifier (DEX mod), already applied to the roll on the right">
                        Init mod {selectedMonster.initiative_modifier >= 0 ? "+" : ""}{selectedMonster.initiative_modifier}
                      </span>
                    )}
                  </div>
                </div>
              )}
              <div className="flex gap-1">
                <div className="w-1/3">
                  <label className="text-[10px] text-gray-500 block mb-0.5" title="Your d20 roll">d20 roll</label>
                  <input type="number" min="1" max="20" value={monsterD20Roll}
                    onChange={(e) => updateD20(e.target.value)} className={`w-full ${inputCls}`} />
                </div>
                <div className="w-1/3">
                  <label
                    className="text-[10px] text-gray-500 block mb-0.5"
                    title={
                      selectedMonster?.initiative_modifier != null
                        ? `d20 + ${selectedMonster.initiative_modifier >= 0 ? "+" : ""}${selectedMonster.initiative_modifier} DEX mod`
                        : "d20 + DEX mod"
                    }
                  >
                    Initiative
                  </label>
                  <input type="number" value={monsterInitiative}
                    onChange={(e) => setMonsterInitiative(e.target.value)} className={`w-full ${inputCls}`} />
                </div>
                <div className="w-1/3">
                  <label className="text-[10px] text-gray-500 block mb-0.5">HP override</label>
                  <input type="number" value={monsterHpOverride}
                    onChange={(e) => setMonsterHpOverride(e.target.value)} className={`w-full ${inputCls}`} />
                </div>
              </div>
              <button onClick={addMonster} disabled={!selectedMonster}
                className="w-full py-1 bg-rose-800 hover:bg-rose-700 disabled:opacity-40 rounded text-xs text-white font-semibold transition-colors">
                Add Monster to Initiative
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Combatant list ── */}
      <div className="flex-1 min-h-0 overflow-y-auto space-y-1">
        {sorted.length === 0 && (
          <div className="text-center py-4 text-gray-500 text-xs flex flex-col items-center gap-2">
            <Swords className="w-6 h-6 opacity-30" />No combatants yet
          </div>
        )}
        {sorted.map((c, i) => {
          const isActive = i === currentIndex;
          const isDead = c.hp === 0;
          return (
            <div key={c.id}
              className={`flex items-center gap-1.5 px-2 py-1.5 rounded border transition-all ${
                isActive ? "bg-purple-900/60 border-purple-500 shadow-[0_0_8px_rgba(139,92,246,0.4)]"
                  : "bg-gray-900/60 border-gray-700/50 hover:border-purple-800/50"
              } ${isDead ? "opacity-50" : ""}`}>
              <span className={`text-xs font-bold w-5 text-center shrink-0 ${isActive ? "text-white" : "text-gray-500"}`}>
                {c.initiative}
              </span>
              <div className="flex-1 min-w-0">
                {c.isPlayer ? (
                  <div className="text-xs font-semibold truncate text-green-400">{isActive && "▶ "}{c.name}</div>
                ) : (
                  <button onClick={() => window.dispatchEvent(new CustomEvent("dm-open-bestiary", { detail: { name: c.name } }))}
                    title="Open bestiary entry"
                    className="text-xs font-semibold truncate text-rose-300 hover:text-rose-100 hover:underline text-left w-full flex items-center gap-0.5 group/name">
                    {isActive && "▶ "}{c.name}
                    <ExternalLink className="w-2.5 h-2.5 opacity-0 group-hover/name:opacity-60 shrink-0 transition-opacity" />
                  </button>
                )}
              </div>
              {c.ac != null && (
                <div className="flex items-center gap-0.5 shrink-0 text-blue-400 bg-blue-900/30 border border-blue-800/30 rounded px-1 py-0.5">
                  <Shield className="w-2.5 h-2.5" /><span className="text-xs font-bold">{c.ac}</span>
                </div>
              )}
              <div className="flex items-center gap-0.5 shrink-0">
                <button onClick={() => updateHp(c.id, -1)} className="w-4 h-4 flex items-center justify-center bg-red-900/60 hover:bg-red-800 rounded text-xs text-red-300">
                  <ChevronDown className="w-3 h-3" />
                </button>
                <span className={`text-xs font-mono w-12 text-center ${isDead ? "text-red-500 font-bold" : "text-gray-300"}`}>
                  {isDead ? "DEAD" : `${c.hp}/${c.maxHp}`}
                </span>
                <button onClick={() => updateHp(c.id, 1)} className="w-4 h-4 flex items-center justify-center bg-green-900/60 hover:bg-green-800 rounded text-xs text-green-300">
                  <ChevronUp className="w-3 h-3" />
                </button>
              </div>
              <button onClick={() => removeCombatant(c.id)} className="w-4 h-4 flex items-center justify-center text-gray-600 hover:text-red-400 transition-colors shrink-0">
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
