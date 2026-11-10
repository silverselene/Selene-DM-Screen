// Character sheet: a read-only popup for a single party member, laid out like
// a printed sheet — header and combat numbers (AC, HP, initiative,
// proficiency) across the top, ability scores down the left, and what they
// can do (weapons, then prepared and known spells, with stats from the
// bundled datasets) on the right. Stacks to one column on a narrow screen.
// Opened by clicking a roster row in PartyWidget.
import type { ReactNode } from "react";
import { X, Shield, Heart, Star, Sword, BookOpen, Sparkles, Zap, Award } from "lucide-react";
import { ABILITY_KEYS, type PlayerCharacter } from "@/types";
import { ABILITY_LABELS, abilityMod, formatMod, proficiencyBonus } from "@/lib/abilities";
import type { Weapon } from "@/data/weapons";
import type { Spell } from "@/data/spells";
import { UNARMED_STRIKE_NAME, withUnarmedStrike } from "@/data/unarmedStrike";
import { splitSpells } from "@/lib/preparedSpells";

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
  attack,
  onOpen,
}: {
  name: string;
  info?: WeaponInfo;
  /** Worked-out attack line, when the sheet can compute one. */
  attack?: string;
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
      {attack && (
        <p className="text-xs font-mono font-semibold mt-0.5 text-amber-300">{attack}</p>
      )}
      {info ? (
        (((info.damage ?? null) !== null && !attack) || info.properties.length > 0 || mastery.length > 0) && (
          <div className="flex items-center gap-1.5 flex-wrap mt-1">
            {info.damage && !attack && (
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
  known = false,
  onOpen,
}: {
  name: string;
  info?: SpellInfo;
  /** Known but not prepared — dimmed. */
  known?: boolean;
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
      } ${known ? "border-dashed opacity-70" : ""}`}
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
  // Unarmed Strike first — every character can make one (display-only).
  const weapons = withUnarmedStrike(character.weapons);
  // Prepared spells (castable now) first, then known-but-not-prepared ones
  // (e.g. the rest of a Wizard's spellbook), each sorted by level then name.
  const byLevel = (a: string, b: string) => {
    const la = spellStats.get(a.toLowerCase())?.level ?? 99;
    const lb = spellStats.get(b.toLowerCase())?.level ?? 99;
    if (la !== lb) return la - lb;
    return a.localeCompare(b);
  };
  const split = splitSpells(character);
  const preparedSpells = [...split.prepared].sort(byLevel);
  const knownSpells = [...split.known].sort(byLevel);
  const spellRow = (s: string, known = false) => (
    <SpellRow
      key={s}
      name={s}
      info={spellStats.get(s.toLowerCase())}
      known={known}
      onOpen={onOpenSpell ? () => onOpenSpell(s) : undefined}
    />
  );

  const ab = character.abilities ?? null;
  const pb = proficiencyBonus(character.level);
  const dexMod = ab?.dex != null ? abilityMod(ab.dex) : null;
  const strMod = ab?.str != null ? abilityMod(ab.str) : null;
  // Unarmed Strike is fully defined by the rules (everyone is proficient), so
  // with a Strength score the sheet can show the real numbers.
  const unarmedAttack =
    strMod != null
      ? `${formatMod(strMod + pb)} to hit · ${Math.max(0, 1 + strMod)} Bludgeoning`
      : undefined;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div
        role="dialog"
        aria-label={`${character.name} — character sheet`}
        className="relative z-10 border rounded-xl p-4 sm:p-5 w-full max-w-3xl max-h-[90vh] overflow-y-auto"
        style={{ background: "var(--dm-bg-card)", borderColor: "var(--dm-border-card)" }}
      >
        {/* ── Header ── */}
        <div className="flex items-start justify-between gap-2 mb-3 pb-3 border-b" style={{ borderColor: "var(--dm-border)" }}>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-xl font-bold truncate" style={{ color: "var(--dm-thead)" }}>
                {character.name}
              </h2>
              <span className="text-sm flex items-center gap-0.5 shrink-0" style={{ color: "var(--dm-accent)" }}>
                <Star className="w-3.5 h-3.5" />Level {character.level}
              </span>
            </div>
            <div className="text-sm truncate" style={{ color: "var(--dm-t2)" }}>
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

        {/* ── Combat numbers ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
          <CombatStat icon={<Shield className="w-4 h-4" />} label="Armor Class" value={character.ac ?? "—"} tone="blue" />
          <CombatStat icon={<Heart className="w-4 h-4" />} label="Hit Points" value={character.hp ?? "—"} tone="red" />
          <CombatStat icon={<Zap className="w-4 h-4" />} label="Initiative" value={dexMod != null ? formatMod(dexMod) : "—"} tone="amber" />
          <CombatStat icon={<Award className="w-4 h-4" />} label="Proficiency" value={formatMod(pb)} tone="purple" />
        </div>

        <div className="grid gap-4 md:grid-cols-[minmax(0,12rem)_minmax(0,1fr)]">
          {/* ── Left: ability scores ── */}
          <section aria-label="Ability scores">
            <SectionTitle>Abilities</SectionTitle>
            <div className="grid grid-cols-3 sm:grid-cols-6 md:grid-cols-2 gap-2">
              {ABILITY_KEYS.map((k) => {
                const score = ab?.[k] ?? null;
                return (
                  <div
                    key={k}
                    title={ABILITY_LABELS[k].long}
                    className="flex flex-col items-center rounded-lg border py-1.5"
                    style={{ background: "var(--dm-bg-item)", borderColor: "var(--dm-border)" }}
                  >
                    <span className="text-[10px] font-bold tracking-wider" style={{ color: "var(--dm-t3)" }}>
                      {ABILITY_LABELS[k].short}
                    </span>
                    <span className="text-xl font-bold leading-tight" style={{ color: "var(--dm-t1)" }}>
                      {score != null ? formatMod(abilityMod(score)) : "—"}
                    </span>
                    <span
                      className="text-[11px] px-1.5 rounded-full border mt-0.5"
                      style={{ color: "var(--dm-t2)", borderColor: "var(--dm-border)" }}
                    >
                      {score ?? "–"}
                    </span>
                  </div>
                );
              })}
            </div>
            {!ab && (
              <p className="text-[11px] mt-2" style={{ color: "var(--dm-t3)" }}>
                No ability scores yet — add them with Edit, or re-import from D&amp;D Beyond.
              </p>
            )}
          </section>

          {/* ── Right: weapons, then spells ── */}
          <div className="min-w-0 space-y-4">
            <section aria-label="Weapons">
              <SectionTitle icon={<Sword className="w-3.5 h-3.5" />}>Weapons</SectionTitle>
              <div className="space-y-1.5">
                {weapons.map((w) => (
                  <WeaponRow
                    key={w}
                    name={w}
                    info={weaponStats.get(w.toLowerCase())}
                    attack={w === UNARMED_STRIKE_NAME ? unarmedAttack : undefined}
                    onOpen={onOpenWeapon ? () => onOpenWeapon(w) : undefined}
                  />
                ))}
              </div>
            </section>

            <section aria-label="Spells">
              <SectionTitle icon={<BookOpen className="w-3.5 h-3.5" />}>
                {knownSpells.length > 0 ? "Prepared spells" : "Spells"}
              </SectionTitle>
              {preparedSpells.length === 0 && knownSpells.length === 0 ? (
                <p className="text-xs" style={{ color: "var(--dm-t3)" }}>No spells known.</p>
              ) : preparedSpells.length === 0 ? (
                <p className="text-xs" style={{ color: "var(--dm-t3)" }}>None prepared.</p>
              ) : (
                <div className="space-y-1.5">{preparedSpells.map((s) => spellRow(s))}</div>
              )}
            </section>

            {knownSpells.length > 0 && (
              <section aria-label="Known spells">
                <SectionTitle icon={<BookOpen className="w-3.5 h-3.5" />} muted>
                  Known — not prepared
                </SectionTitle>
                <div className="space-y-1.5">{knownSpells.map((s) => spellRow(s, true))}</div>
              </section>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function SectionTitle({
  icon,
  muted,
  children,
}: {
  icon?: ReactNode;
  muted?: boolean;
  children: ReactNode;
}) {
  return (
    <h3
      className="flex items-center gap-1.5 mb-1.5 text-xs font-semibold uppercase tracking-wide"
      style={{ color: muted ? "var(--dm-t3)" : "var(--dm-t2)" }}
    >
      {icon}
      {children}
    </h3>
  );
}

const TONES = {
  blue: "border-blue-800/40 bg-blue-900/20 text-blue-300",
  red: "border-red-800/40 bg-red-900/20 text-red-300",
  amber: "border-amber-800/40 bg-amber-900/20 text-amber-300",
  purple: "border-purple-800/40 bg-purple-900/20 text-purple-300",
} as const;

function CombatStat({
  icon,
  label,
  value,
  tone,
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  tone: keyof typeof TONES;
}) {
  return (
    <div
      data-combat-stat={tone}
      className={`flex flex-col items-center justify-center py-2 rounded border ${TONES[tone]}`}
    >
      <span className="flex items-center gap-1 text-[11px] uppercase tracking-wide opacity-90">
        {icon}
        {label}
      </span>
      <span className="text-xl font-bold leading-tight">{value}</span>
    </div>
  );
}
