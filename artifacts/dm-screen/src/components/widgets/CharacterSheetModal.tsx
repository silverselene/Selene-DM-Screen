// Mini character sheet: a read-only, at-a-glance popup for a single party
// member — AC, HP, and the actions they can actually take (weapons equipped,
// spells known) with their combat-relevant stats pulled from the bundled
// weapon/spell datasets. Opened by clicking a roster row in PartyWidget.
import { X, Shield, Heart, Star, Sword, BookOpen, Sparkles } from "lucide-react";
import type { PlayerCharacter } from "@/types";
import type { Weapon } from "@/data/weapons";
import type { Spell } from "@/data/spells";

type WeaponInfo = Pick<
  Weapon,
  "name" | "category" | "damage" | "damage_type" | "properties" | "mastery"
>;
type SpellInfo = Pick<
  Spell,
  | "level" | "school" | "castingTime" | "range" | "duration"
  | "concentration" | "ritual" | "damage" | "healing" | "upcast"
>;

interface Props {
  character: PlayerCharacter;
  weaponStats: Map<string, WeaponInfo>;
  spellStats: Map<string, SpellInfo>;
  onClose: () => void;
  /** Open a spell in the Wizard's Tome. When set, spell rows are clickable. */
  onOpenSpell?: (name: string) => void;
  /** Open a weapon's card in the Compendium. When set, weapon rows are clickable. */
  onOpenWeapon?: (name: string) => void;
}

function WeaponRow({
  name,
  info,
  onOpen,
}: {
  name: string;
  info?: WeaponInfo;
  onOpen?: () => void;
}) {
  const Tag = onOpen ? "button" : "div";
  const mastery = info?.mastery ?? [];
  return (
    <Tag
      {...(onOpen
        ? {
            type: "button" as const,
            onClick: onOpen,
            title: `Open ${name} in the Compendium`,
            "aria-label": `Open ${name} in the Compendium`,
          }
        : {})}
      className={`block w-full text-left px-2.5 py-1.5 rounded border ${
        onOpen ? "cursor-pointer hover:brightness-125 transition-[filter]" : ""
      }`}
      style={{ background: "var(--dm-bg-item)", borderColor: "var(--dm-border)" }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold" style={{ color: "var(--dm-t1)" }}>{name}</span>
        {info?.category && (
          <span className="text-[10px] capitalize shrink-0" style={{ color: "var(--dm-t3)" }}>
            {info.category}
          </span>
        )}
      </div>
      {info ? (
        ((info.damage ?? null) !== null || info.properties.length > 0 || mastery.length > 0) && (
          <div className="flex items-center gap-1.5 flex-wrap mt-1">
            {info.damage && (
              <span className="text-xs font-mono font-semibold text-amber-400">
                {info.damage}{info.damage_type ? ` ${info.damage_type}` : ""}
              </span>
            )}
            {mastery.map((m) => (
              <span
                key={`m-${m}`}
                className="inline-flex items-center gap-0.5 text-[10px] px-1 py-0.5 rounded bg-purple-900/40 text-purple-300"
                title="Weapon Mastery"
              >
                <Sparkles className="w-2.5 h-2.5" />{m}
              </span>
            ))}
            {info.properties.map((p) => (
              <span
                key={p}
                className="text-[10px] px-1 py-0.5 rounded"
                style={{ background: "var(--dm-bg-tag)", color: "var(--dm-t2)" }}
              >
                {p}
              </span>
            ))}
          </div>
        )
      ) : (
        <p className="text-[10px] mt-0.5" style={{ color: "var(--dm-t3)" }}>
          Custom weapon — no stats on file.
        </p>
      )}
    </Tag>
  );
}

function SpellRow({
  name,
  info,
  onOpen,
}: {
  name: string;
  info?: SpellInfo;
  onOpen?: () => void;
}) {
  const levelLabel = info == null ? null : info.level === 0 ? "Cantrip" : `Lv ${info.level}`;
  const Tag = onOpen ? "button" : "div";
  return (
    <Tag
      {...(onOpen
        ? {
            type: "button" as const,
            onClick: onOpen,
            title: `Open ${name} in the Wizard's Tome`,
            "aria-label": `Open ${name} in the Wizard's Tome`,
          }
        : {})}
      className={`block w-full text-left px-2.5 py-1.5 rounded border ${
        onOpen ? "cursor-pointer hover:brightness-125 transition-[filter]" : ""
      }`}
      style={{ background: "var(--dm-bg-item)", borderColor: "var(--dm-border)" }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold" style={{ color: "var(--dm-t1)" }}>{name}</span>
        <div className="flex items-center gap-1 shrink-0">
          {info?.concentration && (
            <span className="text-[9px] px-1 rounded bg-purple-900/40 text-purple-300" title="Concentration">C</span>
          )}
          {info?.ritual && (
            <span className="text-[9px] px-1 rounded bg-indigo-900/40 text-indigo-300" title="Ritual">R</span>
          )}
          {levelLabel && <span className="text-[10px]" style={{ color: "var(--dm-t3)" }}>{levelLabel}</span>}
        </div>
      </div>
      {info ? (
        <>
          <div className="text-[10px] mt-0.5" style={{ color: "var(--dm-t3)" }}>
            {info.school} · {info.castingTime} · {info.range} · {info.duration}
          </div>
          {(info.damage || info.healing) && (
            <div className="flex items-center gap-1.5 mt-1">
              {info.damage && (
                <span
                  className="text-xs font-mono font-semibold text-red-400"
                  title={info.damage.scaling}
                >
                  {info.damage.dice} {info.damage.type}
                </span>
              )}
              {info.healing && (
                <span
                  className="flex items-center gap-1 text-xs font-mono font-semibold text-emerald-400"
                  title={info.healing.scaling}
                >
                  <Heart className="w-3 h-3" />{info.healing.dice}
                </span>
              )}
            </div>
          )}
          {info.upcast && (
            <p className="text-[10px] italic mt-0.5" style={{ color: "var(--dm-t3)" }}>
              Upcast: {info.upcast}
            </p>
          )}
        </>
      ) : (
        <p className="text-[10px] mt-0.5" style={{ color: "var(--dm-t3)" }}>
          Custom spell — no stats on file.
        </p>
      )}
    </Tag>
  );
}

export function CharacterSheetModal({
  character,
  weaponStats,
  spellStats,
  onClose,
  onOpenSpell,
  onOpenWeapon,
}: Props) {
  const weapons = character.weapons ?? [];
  const spells = character.spells ?? [];
  const sortedSpells = [...spells].sort((a, b) => {
    const la = spellStats.get(a.toLowerCase())?.level ?? 99;
    const lb = spellStats.get(b.toLowerCase())?.level ?? 99;
    if (la !== lb) return la - lb;
    return a.localeCompare(b);
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative z-10 border rounded-xl p-5 w-full max-w-md max-h-[85vh] overflow-y-auto"
        style={{ background: "var(--dm-bg-card)", borderColor: "var(--dm-border-card)" }}
      >
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <h2 className="text-lg font-bold truncate" style={{ color: "var(--dm-thead)" }}>
                {character.name}
              </h2>
              <span className="text-xs flex items-center gap-0.5 shrink-0" style={{ color: "var(--dm-accent)" }}>
                <Star className="w-3 h-3" />Lv {character.level}
              </span>
            </div>
            <div className="text-xs truncate" style={{ color: "var(--dm-t2)" }}>
              {[character.race, character.class].filter(Boolean).join(" · ") || "—"}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ color: "var(--dm-t3)" }}
            className="shrink-0 hover:opacity-70 transition-opacity"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* AC / HP — the two numbers a DM needs first */}
        <div className="flex items-center gap-2 mb-4">
          <div className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded border border-blue-800/40 bg-blue-900/20">
            <Shield className="w-4 h-4 text-blue-400" />
            <span className="text-sm text-blue-300">AC</span>
            <span className="text-lg font-bold text-blue-200">{character.ac ?? "—"}</span>
          </div>
          <div className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded border border-red-800/40 bg-red-900/20">
            <Heart className="w-4 h-4 text-red-400" />
            <span className="text-sm text-red-300">HP</span>
            <span className="text-lg font-bold text-red-200">{character.hp ?? "—"}</span>
          </div>
        </div>

        {/* Weapons */}
        <div className="mb-3">
          <div
            className="flex items-center gap-1.5 mb-1.5 text-xs font-semibold uppercase tracking-wide"
            style={{ color: "var(--dm-t2)" }}
          >
            <Sword className="w-3.5 h-3.5" />Weapons
          </div>
          {weapons.length === 0 ? (
            <p className="text-xs" style={{ color: "var(--dm-t3)" }}>No weapons equipped.</p>
          ) : (
            <div className="space-y-1.5">
              {weapons.map((w) => (
                <WeaponRow
                  key={w}
                  name={w}
                  info={weaponStats.get(w.toLowerCase())}
                  onOpen={onOpenWeapon ? () => onOpenWeapon(w) : undefined}
                />
              ))}
            </div>
          )}
        </div>

        {/* Spells */}
        <div>
          <div
            className="flex items-center gap-1.5 mb-1.5 text-xs font-semibold uppercase tracking-wide"
            style={{ color: "var(--dm-t2)" }}
          >
            <BookOpen className="w-3.5 h-3.5" />Spells
          </div>
          {sortedSpells.length === 0 ? (
            <p className="text-xs" style={{ color: "var(--dm-t3)" }}>No spells known.</p>
          ) : (
            <div className="space-y-1.5">
              {sortedSpells.map((s) => (
                <SpellRow
                  key={s}
                  name={s}
                  info={spellStats.get(s.toLowerCase())}
                  onOpen={onOpenSpell ? () => onOpenSpell(s) : undefined}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
