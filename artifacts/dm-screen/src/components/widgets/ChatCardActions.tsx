import { useEffect, useRef, useState } from "react";
import { Swords, UserPlus } from "lucide-react";
import type { PlayerCharacter } from "@/types";
import {
  cardHasParseableHp,
  cardSpellWeaponLists,
  characterCardToCombatant,
  characterCardToPlayerDraft,
  diffPlayer,
  draftToPlayerInput,
  mergeNameLists,
  monsterCardToCombatant,
  PLAYER_DRAFT_FIELDS,
  type PlayerDraft,
  type ToolResultCard,
} from "@/lib/cardHandoff";
import {
  addCombatantToInitiative,
  confirmDuplicateViaWindow,
  initiativeFullMessage,
  rollD20,
} from "@/lib/combatant";
import { sameName } from "@/lib/names";
import { addCharacter, loadParty, updateCharacter } from "@/lib/partyStore";

const btn =
  "px-2 py-1 rounded text-[10px] font-medium border transition-colors disabled:opacity-40";

export function ChatCardActions({ card }: { card: ToolResultCard }) {
  const [flash, setFlash] = useState<string | null>(null);
  const [form, setForm] = useState<PlayerDraft | null>(null);
  const [existing, setExisting] = useState<PlayerCharacter | null>(null);
  // Track the flash-clear timer so a card unmounting within the 1.5s window
  // (chat re-render, tile removed) doesn't fire setState on a dead component.
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (flashTimer.current) clearTimeout(flashTimer.current);
    },
    [],
  );

  if (card.kind !== "monster" && card.kind !== "character") return null;

  const showFlash = (msg: string) => {
    setFlash(msg);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => {
      setFlash((m) => (m === msg ? null : m));
      flashTimer.current = null;
    }, 1500);
  };

  const addToInitiative = () => {
    const combatant =
      card.kind === "monster"
        ? monsterCardToCombatant(card, rollD20())
        : characterCardToCombatant(card, rollD20());
    // Monster cards produce isPlayer: false, which findDuplicatePlayer ignores —
    // passing the confirm unconditionally is safe and keeps the two card kinds
    // on one code path.
    const result = addCombatantToInitiative(combatant, {
      confirmDuplicate: confirmDuplicateViaWindow,
    });
    if (result === "full") return void window.alert(initiativeFullMessage());
    if (result === "error") {
      return void window.alert(
        "Couldn't add to initiative — place the Initiative tile and try again.",
      );
    }
    // "cancelled": the DM declined the duplicate confirm — no flash, nothing added.
    if (result === "cancelled") return;
    // A card whose HP didn't parse (summary-only sheet, drifted format) minted
    // a 0/0 combatant — added fine, but it renders as downed. Say so, instead
    // of a bare success flash that leaves the DM to discover it mid-combat.
    if (!cardHasParseableHp(card)) {
      showFlash("Added — no HP on card, set it in Initiative");
      return;
    }
    showFlash("Added to Initiative ✓");
  };

  // The character sheet's spell/weapon names (cleaned/de-duped), imported
  // alongside the editable stat fields. Empty for a summary-only sheet.
  const lists = cardSpellWeaponLists(card);

  const startAddToParty = () => {
    const draft = characterCardToPlayerDraft(card);
    const match = loadParty().find((p) => sameName(p.name, draft.name));
    if (!match) {
      try {
        addCharacter(draftToPlayerInput(draft, lists));
        showFlash("Added to Party ✓");
      } catch (e) {
        window.alert((e as Error).message);
      }
      return;
    }
    setExisting(match);
    setForm(draft);
  };

  const commitParty = (mode: "replace" | "new") => {
    if (!form) return;
    try {
      if (mode === "replace" && existing) {
        // Re-importing over an existing sheet: union the imported spell/weapon
        // lists with the DM's existing ones (the collision diff never shows
        // them) so neither the freshly imported entries nor any hand-added ones
        // are lost.
        updateCharacter(existing.id, {
          // spells/weapons come from the merge below, not the draft, so leave
          // draftToPlayerInput's lists at their default empty.
          ...draftToPlayerInput(form),
          spells: mergeNameLists(existing.spells, lists.spells),
          weapons: mergeNameLists(existing.weapons, lists.weapons),
        });
        showFlash("Replaced ✓");
      } else {
        addCharacter(draftToPlayerInput(form, lists));
        showFlash("Added to Party ✓");
      }
      setForm(null);
      setExisting(null);
    } catch (e) {
      window.alert((e as Error).message);
    }
  };

  const setField = (patch: Partial<PlayerDraft>) =>
    setForm((f) => (f ? { ...f, ...patch } : f));

  // ── Collision edit form ──
  if (form && existing) {
    const identical = diffPlayer(existing, form).length === 0;
    return (
      <div className="mt-2 pt-2 border-t" style={{ borderColor: "var(--dm-border)" }}>
        <div className="text-[10px] mb-1.5" style={{ color: "var(--dm-t2)" }}>
          <span className="font-semibold" style={{ color: "var(--dm-t1)" }}>{existing.name}</span>{" "}
          is already in your party.
          {identical && " No changes — the sheets are identical."}
        </div>
        <div className="flex flex-col gap-1">
          {PLAYER_DRAFT_FIELDS.map(({ field, label, type }) => {
            const current = form[field];
            const was = existing[field];
            const changed = String(current ?? "") !== String(was ?? "");
            return (
              <label key={field} className="flex items-center gap-1.5 text-[10px]">
                <span className="w-10 uppercase tracking-wide text-amber-300/70">{label}</span>
                <input
                  type={type}
                  value={current ?? ""}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (type !== "number") {
                      // race / class are `string | null`.
                      setField({ [field]: v === "" ? null : v } as Partial<PlayerDraft>);
                    } else if (field === "level") {
                      // level is a non-nullable `number`; keep the prior value
                      // when the input is cleared/invalid rather than casting
                      // null into it.
                      const n = parseInt(v, 10);
                      if (Number.isFinite(n)) setField({ level: n });
                    } else {
                      // ac / hp are `number | null`.
                      const n = v === "" ? null : parseInt(v, 10);
                      setField({ [field]: Number.isNaN(n as number) ? null : n } as Partial<PlayerDraft>);
                    }
                  }}
                  className={`flex-1 min-w-0 px-1.5 py-0.5 rounded border bg-black/20 ${
                    changed ? "border-amber-500/70" : "border-amber-800/40"
                  }`}
                  style={{ color: "var(--dm-t2)" }}
                />
                {changed && (
                  <span className="text-amber-400/60 whitespace-nowrap">was: {String(was ?? "—")}</span>
                )}
              </label>
            );
          })}
        </div>
        <div className="mt-2 flex gap-1.5">
          <button
            onClick={() => commitParty("replace")}
            className={`${btn} border-amber-500/60 text-amber-200 hover:bg-amber-900/40`}
          >
            Replace
          </button>
          <button
            onClick={() => commitParty("new")}
            className={`${btn} border-amber-800/50 text-amber-300/80 hover:bg-amber-900/30`}
          >
            Add as new
          </button>
          <button
            onClick={() => { setForm(null); setExisting(null); }}
            className={`${btn} border-transparent`}
            style={{ color: "var(--dm-t3)" }}
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // ── Idle action row ──
  return (
    <div className="mt-2 pt-2 border-t flex items-center gap-1.5" style={{ borderColor: "var(--dm-border)" }}>
      <button
        onClick={addToInitiative}
        className={`${btn} border-amber-800/50 text-amber-300/80 hover:bg-amber-900/30 inline-flex items-center gap-1`}
      >
        <Swords className="w-3 h-3" /> Add to Initiative
      </button>
      {card.kind === "character" && (
        <button
          onClick={startAddToParty}
          className={`${btn} border-amber-800/50 text-amber-300/80 hover:bg-amber-900/30 inline-flex items-center gap-1`}
        >
          <UserPlus className="w-3 h-3" /> Add to Party
        </button>
      )}
      {flash && <span className="text-[10px] text-emerald-400/90">{flash}</span>}
    </div>
  );
}
