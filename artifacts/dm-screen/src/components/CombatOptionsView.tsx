// Shared presentation for a monster's combat options — the attacks it can make,
// the saves it can force, and the spells it can cast. Rendered by BOTH the
// Bestiary stat block (as its "Attacks" / "Spells" tabs) and the Initiative
// tracker (inline under a combatant row), so the DM reads the same layout
// wherever they happen to be looking mid-encounter. Keep this the single source
// of truth for that styling, the way SpellCardBody is for spells.
//
// The derivation is `deriveCombatOptions` in @/lib/statblockCombat; this file
// only renders it. Every parsed row can be expanded to reveal the untouched
// source sentence — the parser is heuristic over three different upstream prose
// styles, so the original text is always one click away rather than replaced.

import { useState } from "react";
import { ChevronDown, ChevronRight, Sparkles, Swords, Target } from "lucide-react";
import type { Spell } from "@/data/spells";
import { SpellCardBody, spellLevelLabels, spellSchoolColors } from "@/components/SpellCardBody";
import {
  formatDamage,
  formatDistance,
  formatToHit,
  type CombatOptions,
  type MonsterAttack,
  type MonsterSaveAction,
  type OptionOrigin,
  type SpellcastingBlock,
} from "@/lib/statblockCombat";

// Origin badges. "action" gets none — that is the default and a badge on every
// row would be noise; the ones that cost something else are what the DM needs
// flagged.
const ORIGIN_BADGE: Partial<Record<OptionOrigin, { label: string; cls: string }>> = {
  legendary: { label: "LEG", cls: "text-amber-400 border-amber-700/50" },
  reaction: { label: "REA", cls: "text-sky-400 border-sky-700/50" },
  trait: { label: "TRAIT", cls: "text-gray-400 border-gray-600/50" },
};

function OriginBadge({ origin }: { origin: OptionOrigin }) {
  const badge = ORIGIN_BADGE[origin];
  if (!badge) return null;
  return (
    <span className={`text-[10px] border rounded px-0.5 leading-tight shrink-0 ${badge.cls}`}>
      {badge.label}
    </span>
  );
}

const KIND_LABEL: Record<MonsterAttack["kind"], string> = {
  melee: "Melee",
  ranged: "Ranged",
  "melee-or-ranged": "Melee/Ranged",
};

/** A parsed row: summary line always visible, source text behind a disclosure. */
function ExpandableRow({
  summary,
  detail,
  expanded,
  onToggle,
}: {
  summary: React.ReactNode;
  detail: React.ReactNode;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="bg-gray-900/60 border border-gray-800/60 rounded">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="w-full text-left px-1.5 py-1 flex items-start gap-1 hover:bg-gray-800/50 transition-colors rounded"
      >
        {expanded ? (
          <ChevronDown className="w-3 h-3 mt-0.5 shrink-0 text-gray-500" />
        ) : (
          <ChevronRight className="w-3 h-3 mt-0.5 shrink-0 text-gray-500" />
        )}
        <span className="flex-1 min-w-0">{summary}</span>
      </button>
      {expanded && (
        <div className="px-1.5 pb-1.5 pl-5 text-[12px] leading-relaxed text-gray-400">{detail}</div>
      )}
    </div>
  );
}

function AttackRow({ attack }: { attack: MonsterAttack }) {
  const [expanded, setExpanded] = useState(false);
  const distance = formatDistance(attack);
  const damage = formatDamage(attack.damage);
  return (
    <ExpandableRow
      expanded={expanded}
      onToggle={() => setExpanded((v) => !v)}
      summary={
        <>
          <span className="flex items-center gap-1 flex-wrap">
            <span className="text-[12px] font-bold text-gray-100">{attack.name}</span>
            <OriginBadge origin={attack.origin} />
            {attack.isSpellAttack && (
              <span className="text-[10px] text-cyan-400 border border-cyan-700/50 rounded px-0.5 leading-tight shrink-0">
                SPELL
              </span>
            )}
            <span className="text-[12px] font-mono font-bold text-amber-300 bg-amber-950/40 border border-amber-800/40 rounded px-1">
              {formatToHit(attack.toHit)}
            </span>
          </span>
          <span className="flex items-center gap-x-2 gap-y-0.5 flex-wrap text-[12px] text-gray-400">
            <span className="text-gray-500">{KIND_LABEL[attack.kind]}</span>
            {distance && <span>{distance}</span>}
            {damage ? (
              <span className="text-rose-300">{damage}</span>
            ) : (
              // A real case, not a parse failure: "Hit: The creature is
              // grappled" attacks deal no damage at all.
              <span className="text-gray-600 italic">no damage</span>
            )}
            {attack.save && (
              <span className="text-purple-300">
                DC {attack.save.dc} {attack.save.ability.slice(0, 3).toUpperCase()}
              </span>
            )}
          </span>
        </>
      }
      detail={
        <>
          {attack.weapon && (
            <div className="mb-1 text-[12px]">
              <span className="text-gray-500 font-semibold">Weapon </span>
              <span className="text-gray-300">
                {attack.weapon.name}
                {attack.weapon.category ? ` (${attack.weapon.category})` : ""}
                {attack.weapon.damage
                  ? ` — ${attack.weapon.damage}${attack.weapon.damageType ? ` ${attack.weapon.damageType.toLowerCase()}` : ""}`
                  : ""}
              </span>
              {attack.weapon.properties.length > 0 && (
                <span className="flex flex-wrap gap-1 mt-0.5">
                  {attack.weapon.properties.map((p) => (
                    <span key={p} className="text-[11px] px-1 bg-gray-800 text-gray-400 rounded">
                      {p}
                    </span>
                  ))}
                </span>
              )}
            </div>
          )}
          {attack.desc}
        </>
      }
    />
  );
}

function SaveActionRow({ action }: { action: MonsterSaveAction }) {
  const [expanded, setExpanded] = useState(false);
  const damage = formatDamage(action.damage);
  return (
    <ExpandableRow
      expanded={expanded}
      onToggle={() => setExpanded((v) => !v)}
      summary={
        <>
          <span className="flex items-center gap-1 flex-wrap">
            <span className="text-[12px] font-bold text-gray-100">{action.name}</span>
            <OriginBadge origin={action.origin} />
            <span className="text-[12px] font-mono font-bold text-purple-200 bg-purple-950/50 border border-purple-800/40 rounded px-1">
              DC {action.save.dc} {action.save.ability.slice(0, 3).toUpperCase()}
            </span>
          </span>
          <span className="flex items-center gap-x-2 flex-wrap text-[12px] text-gray-400">
            <span className="text-gray-500">Save</span>
            {damage && <span className="text-rose-300">{damage}</span>}
          </span>
        </>
      }
      detail={action.desc}
    />
  );
}

/** One spell as a clickable chip; expands its full card inline rather than
 *  sending the DM to the Wizard's Tome — mid-combat, leaving the widget you are
 *  reading is the expensive part. */
function SpellChip({
  spell,
  open,
  onToggle,
}: {
  spell: Spell;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      title={`${spell.level === 0 ? "Cantrip" : `${spellLevelLabels[spell.level]}-level`} ${spell.school}`}
      className={`flex items-center gap-1 text-[12px] px-1.5 py-0.5 rounded border transition-colors ${
        open
          ? "bg-cyan-900/50 border-cyan-600 text-cyan-100"
          : "bg-gray-800/70 border-gray-700 text-gray-300 hover:border-cyan-700/60 hover:text-cyan-200"
      }`}
    >
      <span className="font-mono text-[11px] text-gray-500">{spell.level === 0 ? "C" : spell.level}</span>
      <span>{spell.name}</span>
      {spell.concentration && <span className="text-[10px] text-blue-400">●C</span>}
      {spell.ritual && <span className="text-[10px] text-yellow-500">●R</span>}
      <span className={`text-[10px] ${spellSchoolColors[spell.school] ?? "text-gray-500"}`}>
        {spell.school.slice(0, 4)}
      </span>
    </button>
  );
}

function SpellcastingSection({ block }: { block: SpellcastingBlock }) {
  // Keyed by spell name: one open spell card at a time, so the panel doesn't
  // grow into a wall of full descriptions inside a tile that has to stay
  // readable at 1/4 of the dashboard.
  const [openSpell, setOpenSpell] = useState<string | null>(null);
  const [showSource, setShowSource] = useState(false);
  const open = block.groups
    .flatMap((g) => g.spells)
    .find((s) => s.name === openSpell);

  return (
    <div className="space-y-1">
      <div className="flex items-baseline gap-1.5 flex-wrap">
        <span className="text-[12px] font-bold text-cyan-300">{block.name}</span>
        <OriginBadge origin={block.origin} />
        {block.ability && <span className="text-[12px] text-gray-500">{block.ability}</span>}
        {block.saveDc !== null && (
          <span className="text-[12px] font-mono text-purple-200 bg-purple-950/50 border border-purple-800/40 rounded px-1">
            save DC {block.saveDc}
          </span>
        )}
        {block.attackBonus !== null && (
          <span className="text-[12px] font-mono text-amber-300 bg-amber-950/40 border border-amber-800/40 rounded px-1">
            {formatToHit(block.attackBonus)} spell atk
          </span>
        )}
      </div>

      {block.groups.map((group) => (
        <div key={group.label}>
          <div className="text-[11px] uppercase tracking-wider text-gray-500 font-semibold">
            {group.label}
          </div>
          <div className="flex flex-wrap gap-1 mt-0.5">
            {group.spells.map((spell) => (
              <SpellChip
                key={spell.name}
                spell={spell}
                open={openSpell === spell.name}
                onToggle={() => setOpenSpell((cur) => (cur === spell.name ? null : spell.name))}
              />
            ))}
          </div>
        </div>
      ))}

      {open && (
        <div className="mt-1">
          <SpellCardBody spell={open} />
        </div>
      )}

      {/* The block's own words. Always reachable: a spell outside the bundled
          557 (homebrew, or a third-party book's own spell) resolves to no chip,
          and this is where the DM still finds it. */}
      <button
        type="button"
        onClick={() => setShowSource((v) => !v)}
        aria-expanded={showSource}
        className="text-[11px] text-gray-500 hover:text-gray-300 transition-colors"
      >
        {showSource ? "Hide" : "Show"} stat block text
      </button>
      {showSource && (
        <p className="text-[12px] leading-relaxed text-gray-400 whitespace-pre-line">{block.desc}</p>
      )}
    </div>
  );
}

function SectionHeading({ icon, label, count }: { icon: React.ReactNode; label: string; count: number }) {
  return (
    <div className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-gray-500">
      {icon}
      {label}
      <span className="opacity-60">{count}</span>
    </div>
  );
}

/** The attack half: Multiattack, attack rolls, and save-forcing actions. */
export function AttackOptions({ options }: { options: CombatOptions }) {
  const { attacks, saveActions, multiattack } = options;
  if (attacks.length === 0 && saveActions.length === 0 && multiattack === null) {
    return (
      <p className="text-[12px] text-gray-600 italic">
        No attacks or save effects found in this stat block.
      </p>
    );
  }
  return (
    <div className="space-y-1.5">
      {multiattack && (
        <div className="bg-amber-950/25 border border-amber-900/40 rounded px-1.5 py-1">
          <span className="text-[11px] font-bold uppercase tracking-wider text-amber-400">
            Multiattack
          </span>
          <p className="text-[12px] leading-relaxed text-gray-300">{multiattack}</p>
        </div>
      )}
      {attacks.length > 0 && (
        <div className="space-y-1">
          <SectionHeading icon={<Swords className="w-2.5 h-2.5" />} label="Attacks" count={attacks.length} />
          {attacks.map((attack, i) => (
            <AttackRow key={`${attack.name}-${attack.origin}-${i}`} attack={attack} />
          ))}
        </div>
      )}
      {saveActions.length > 0 && (
        <div className="space-y-1">
          <SectionHeading icon={<Target className="w-2.5 h-2.5" />} label="Save effects" count={saveActions.length} />
          {saveActions.map((action, i) => (
            <SaveActionRow key={`${action.name}-${action.origin}-${i}`} action={action} />
          ))}
        </div>
      )}
    </div>
  );
}

/** The spell half: every spellcasting block the stat block describes. */
export function SpellOptions({ options }: { options: CombatOptions }) {
  if (options.spellcasting.length === 0) {
    return <p className="text-[12px] text-gray-600 italic">This creature has no spellcasting.</p>;
  }
  return (
    <div className="space-y-2">
      {options.spellcasting.map((block, i) => (
        <SpellcastingSection key={`${block.name}-${i}`} block={block} />
      ))}
    </div>
  );
}

/**
 * Both halves in one scroll — what the Initiative tracker shows under a
 * combatant's row, where tabbing would cost a click during someone's turn.
 */
export function CombatOptionsView({ options }: { options: CombatOptions }) {
  const hasAttacks =
    options.attacks.length > 0 || options.saveActions.length > 0 || options.multiattack !== null;
  return (
    <div className="space-y-2">
      {hasAttacks && <AttackOptions options={options} />}
      {options.spellcasting.length > 0 && (
        <div className="space-y-1">
          <SectionHeading
            icon={<Sparkles className="w-2.5 h-2.5" />}
            label="Spells"
            count={options.spellCount}
          />
          <SpellOptions options={options} />
        </div>
      )}
      {!hasAttacks && options.spellcasting.length === 0 && (
        <p className="text-[12px] text-gray-600 italic">
          No attacks or spells in this creature's stat block.
        </p>
      )}
    </div>
  );
}
