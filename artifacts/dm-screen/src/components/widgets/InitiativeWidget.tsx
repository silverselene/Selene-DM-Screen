import { useState, useEffect, useRef } from "react";
import {
  Plus, Trash2, ChevronDown, ChevronUp, Swords,
  SkipForward, RotateCcw, Search, Skull, User, Shield, ExternalLink, Users,
} from "lucide-react";
import type { Combatant, PlayerCharacter } from "@/types";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { useParty } from "@/lib/partyStore";
import { searchMonsters, type MonsterSearchHit } from "@/lib/monsterSearch";
import {
  INITIATIVE_MODES,
  mintCombatantId,
  validateBoundedInt,
  validateCombatants,
  validateEnum,
  validateInitiativeActiveId,
  type ShapeValidator,
} from "@/lib/backup";
import { isV1Empty } from "@/lib/migrations";
import { isImeComposing } from "@/lib/keyboard";

// Parse a numeric input string and clamp it to a sane range. The `<input
// type="number" min max>` attributes are only UI hints — a DM can still type
// (or paste) "200" or "-3", which would otherwise flow straight through
// `parseInt` and sort the combatant to the wrong end of the order. Empty /
// unparseable input falls back to `fallback`.
const clampInt = (raw: string, min: number, max: number, fallback = 0): number => {
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
};

// Bounds. Initiative allows a wide range (high-DEX + bonuses can exceed 20, and
// penalties can go negative) but is still capped so a stray "200" can't break
// the sort. HP/AC are non-negative; AC tops out at the same 99 the party store
// uses, HP at 9999.
const INIT_MIN = -99;
const INIT_MAX = 999;
const HP_MAX = 9999;
const AC_MAX = 99;

// Validators paired with each persistent key. Same shape checks the
// backup-import path runs — so a malformed stored value (DevTools edit,
// SW cache mismatch, future write bug) falls back to defaults instead of
// crashing render or producing NaN-poisoned HP.
const validateRound = validateBoundedInt(1, 9999);
const validateAddMode = validateEnum(INITIATIVE_MODES);

// Combatant ids come from the shared `mintCombatantId()` (random suffix) so
// live adds here and party dispatches from `PartyWidget` — which feed the
// same list — can't collide on a same-millisecond mint.

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

// Initial-value factory for `useLocalStorage` that falls back to the
// pre-v1 legacy key when the v1 key is absent. The boot-time migration
// (`runMigrationsOnce` in `main.tsx`) normally copies legacy → v1 and
// deletes legacy, so this fallback only kicks in if that copy's
// `setItem` threw (quota / private mode): the v1 key is still empty but
// the legacy value is intact, so the DM's in-progress encounter remains
// visible to the UI instead of being silently hidden behind a default
// `[]`/`0`/`1`.
function legacyInitialValue<T>(
  legacyKey: string,
  validator: ShapeValidator<T>,
  fallback: T,
): () => T {
  return () => {
    try {
      const raw = window.localStorage.getItem(legacyKey);
      if (isV1Empty(raw)) return fallback;
      const validated = validator(JSON.parse(raw as string));
      return validated === undefined ? fallback : validated;
    } catch {
      return fallback;
    }
  };
}

type AddMode = (typeof INITIATIVE_MODES)[number];

export function InitiativeWidget() {
  // Versioned per phase 2 ("Persist live combat state to a versioned key").
  // Migration from the older unversioned keys (dm-initiative /
  // dm-initiative-turn / dm-round) is handled once at module load — see
  // migrateLegacyInitiativeKeys() above.
  const [combatants, setCombatants] = useLocalStorage<Combatant[]>(
    "dm-initiative-v1",
    legacyInitialValue("dm-initiative", validateCombatants, []),
    validateCombatants,
  );
  // Active combatant tracked by id, not by sort-list index — so removing
  // the active combatant (or any initiative tie re-sort) doesn't silently
  // re-point the turn highlight to whoever shifts into that index. The
  // pre-existing `dm-initiative-turn-v1` key is migrated to this one once
  // at module load (see `migrateTurnIndexToActiveId` above).
  const [activeId, setActiveId] = useLocalStorage<string | null>(
    "dm-initiative-active-id-v1",
    null,
    validateInitiativeActiveId,
  );
  const [round, setRound] = useLocalStorage<number>(
    "dm-round-v1",
    legacyInitialValue("dm-round", validateRound, 1),
    validateRound,
  );
  const [showForm, setShowForm] = useState(false);
  // Persist the last-used Add tab — the DM tends to add the same kind of
  // combatant repeatedly in a given session.
  const [addMode, setAddMode] = useLocalStorage<AddMode>(
    "dm-initiative-mode-v1",
    "player",
    validateAddMode,
  );

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
  const currentIndex = activeId
    ? sorted.findIndex((c) => c.id === activeId)
    : -1;

  // Reconcile a dangling active-id. `activeId` and the combatant list live
  // under separate localStorage keys and validate independently, so a load
  // that renumbered a duplicate id (`validateCombatants`) — or a hand-edited
  // backup — can leave `activeId` pointing at a combatant that no longer
  // exists. Clear it so the persisted pointer always references a real
  // combatant or null, and `nextTurn` starts cleanly from the top instead of
  // silently restarting the order without anyone noticing.
  useEffect(() => {
    if (activeId !== null && currentIndex < 0) setActiveId(null);
  }, [activeId, currentIndex, setActiveId]);

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
    const roll = parseInt(v, 10);
    if (!Number.isFinite(roll)) {
      // Allow an empty / mid-edit field; don't force a value while typing.
      setMonsterD20Roll(v);
      return;
    }
    // A d20 is 1–20 — clamp so the derived initiative can't be poisoned by a
    // typo'd "200" (the input's min/max attrs don't enforce this).
    const d20 = Math.max(1, Math.min(20, roll));
    setMonsterD20Roll(String(d20));
    const mod = selectedMonster?.initiative_modifier ?? 0;
    setMonsterInitiative(String(d20 + mod));
  };

  // ── Add combatant helpers ──
  const addPlayer = () => {
    if (!form.name.trim()) return;
    const hp = clampInt(form.hp, 0, HP_MAX);
    const newC: Combatant = {
      id: mintCombatantId(), name: form.name.trim(),
      initiative: clampInt(form.initiative, INIT_MIN, INIT_MAX),
      hp, maxHp: hp,
      ac: form.ac ? clampInt(form.ac, 0, AC_MAX) : undefined,
      isPlayer: form.isPlayer,
    };
    setCombatants([...combatants, newC].sort((a, b) => b.initiative - a.initiative));
    setForm(freshForm());
    setShowForm(false);
  };

  const addMonster = () => {
    if (!selectedMonster) return;
    const overrideHp = parseInt(monsterHpOverride, 10);
    const hp = Number.isFinite(overrideHp)
      ? Math.max(0, Math.min(HP_MAX, overrideHp))
      : parseMaxHp(selectedMonster.hp);
    const newC: Combatant = {
      id: mintCombatantId(), name: selectedMonster.name,
      initiative: clampInt(monsterInitiative, INIT_MIN, INIT_MAX),
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
      id: mintCombatantId(), name: selectedPc.name,
      initiative: clampInt(pcInitiative, INIT_MIN, INIT_MAX),
      hp: selectedPc.hp || 0, maxHp: selectedPc.hp || 0,
      ac: selectedPc.ac ?? undefined, isPlayer: true,
    };
    setCombatants([...combatants, newC].sort((a, b) => b.initiative - a.initiative));
    setSelectedPc(null); setPcInitiative("");
    setShowForm(false);
  };

  const removeCombatant = (id: string) => {
    // Persist from the freshest state (functional updater) so a combatant
    // added via `dm-add-to-initiative` in the same render tick isn't dropped
    // by a stale `combatants` closure.
    setCombatants((prev) =>
      prev.filter((c) => c.id !== id).sort((a, b) => b.initiative - a.initiative),
    );
    // Active-id repoint is best-effort — derived from the in-scope snapshot,
    // it only decides whose turn is highlighted, never combatant data.
    if (id !== activeId) return;
    const next = combatants
      .filter((c) => c.id !== id)
      .sort((a, b) => b.initiative - a.initiative);
    if (next.length === 0) {
      setActiveId(null);
      return;
    }
    // The active combatant was just removed — advance the turn pointer to
    // whoever sorts into the same slot in the new list. If the removed
    // combatant was last in initiative order, wrap to the top and bump
    // `round` so the encounter doesn't silently regress to the previous
    // combatant without a round increment.
    const oldIdx = sorted.findIndex((c) => c.id === id);
    if (oldIdx >= next.length) {
      setActiveId(next[0].id);
      setRound((r) => r + 1);
      return;
    }
    setActiveId(next[oldIdx].id);
  };

  const updateHp = (id: string, delta: number) => {
    setCombatants((prev) =>
      prev.map((c) => (c.id === id ? { ...c, hp: Math.max(0, c.hp + delta) } : c)),
    );
  };

  const nextTurn = () => {
    if (sorted.length === 0) return;
    // If nobody is active yet (or the previously-active combatant is no
    // longer in the list), Next starts at the top of the order without
    // bumping the round counter.
    if (currentIndex < 0) {
      setActiveId(sorted[0].id);
      return;
    }
    const next = (currentIndex + 1) % sorted.length;
    if (next === 0) setRound((r) => r + 1);
    setActiveId(sorted[next].id);
  };

  const reset = () => {
    if (combatants.length && !window.confirm("Reset the encounter? This clears all combatants and resets to round 1.")) return;
    setCombatants([]); setActiveId(null); setRound(1);
  };

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
            title="Add a combatant"
            className="flex items-center gap-1 text-xs px-2 py-1 bg-gray-700/60 hover:bg-gray-600/60 rounded transition-colors text-gray-300">
            <Plus className="w-3 h-3" />
          </button>
          <button onClick={reset}
            title="Reset encounter"
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
                onKeyDown={(e) => { if (e.key === "Enter" && !isImeComposing(e)) addPlayer(); }}
                className={`w-full ${inputCls}`} />
              <div className="flex gap-1">
                <div className="w-1/3">
                  <label className="text-[10px] text-gray-500 block mb-0.5">Initiative</label>
                  <input type="number" value={form.initiative}
                    onChange={(e) => setForm({ ...form, initiative: e.target.value })} className={`w-full ${inputCls}`} />
                </div>
                <div className="w-1/3">
                  <label className="text-[10px] text-gray-500 block mb-0.5">HP</label>
                  <input type="number" min="0" value={form.hp}
                    onChange={(e) => setForm({ ...form, hp: e.target.value })} className={`w-full ${inputCls}`} />
                </div>
                <div className="w-1/3">
                  <label className="text-[10px] text-gray-500 block mb-0.5">AC</label>
                  <input type="number" min="0" value={form.ac}
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
                    onKeyDown={(e) => { if (e.key === "Enter" && !isImeComposing(e)) addFromParty(); }}
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
                  <input type="number" min="0" value={monsterHpOverride}
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
            <Swords className="w-6 h-6 opacity-30" />
            No combatants yet — click + to add a player, party member, or monster.
          </div>
        )}
        {sorted.map((c) => {
          const isActive = c.id === activeId;
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
