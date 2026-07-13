import type { Spell } from "@/data/spells";

// Shared spell presentation. Extracted from the Wizard's Tome detail view so the
// AI Chat spell cards render identically to the Tome (the widget resolves a
// spell result against the bundled dataset and hands the entry here). Keep this
// the single source of truth for spell styling — edit it, not a per-widget copy.

export const spellLevelLabels = ["Cantrip", "1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th"];

export const spellSchoolColors: Record<string, string> = {
  Abjuration: "text-blue-400",
  Conjuration: "text-yellow-400",
  Divination: "text-cyan-400",
  Enchantment: "text-pink-400",
  Evocation: "text-orange-400",
  Illusion: "text-purple-400",
  Necromancy: "text-green-400",
  Transmutation: "text-amber-400",
};

/** The spell card body (no Back button / scroll wrapper). Rendered inside the
 *  Wizard's Tome detail view and inside an AI-chat spell card. */
export function SpellCardBody({ spell }: { spell: Spell }) {
  return (
    <div className="bg-gray-900/80 border border-cyan-900/40 rounded p-3 space-y-2">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <h3 className="text-sm font-bold text-white">{spell.name}</h3>
        <div className="flex gap-1.5 flex-wrap">
          {spell.ritual && (
            <span className="text-[10px] px-1.5 py-0.5 bg-yellow-900/40 text-yellow-400 border border-yellow-800/40 rounded">Ritual</span>
          )}
          {spell.concentration && (
            <span className="text-[10px] px-1.5 py-0.5 bg-blue-900/40 text-blue-400 border border-blue-800/40 rounded">Conc.</span>
          )}
        </div>
      </div>

      <div className="text-xs italic text-gray-400">
        {spell.level === 0 ? "Cantrip" : `${spellLevelLabels[spell.level]}-Level`} {spell.school}
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
        <div><span className="text-gray-500 font-semibold">Casting Time: </span><span className="text-gray-300">{spell.castingTime}</span></div>
        <div><span className="text-gray-500 font-semibold">Range: </span><span className="text-gray-300">{spell.range}</span></div>
        <div className="col-span-2"><span className="text-gray-500 font-semibold">Damage: </span><span className="text-gray-300">{spell.damageSummary}</span></div>
        <div><span className="text-gray-500 font-semibold">Components: </span><span className="text-gray-300">{spell.components}</span></div>
        <div><span className="text-gray-500 font-semibold">Duration: </span><span className="text-gray-300">{spell.duration}</span></div>
      </div>

      <div className="border-t border-gray-800 pt-2">
        <p className="text-xs text-gray-300 leading-relaxed">{spell.description}</p>
      </div>

      {spell.upcast && (
        <div className="bg-cyan-950/30 border border-cyan-900/40 rounded p-2">
          <span className="text-[10px] font-bold text-cyan-400 uppercase tracking-wide">At Higher Levels: </span>
          <span className="text-[10px] text-gray-300">{spell.upcast}</span>
        </div>
      )}

      <div className="flex flex-wrap gap-1 pt-1">
        {spell.classes.map((c) => (
          <span key={c} className="text-[10px] px-1.5 py-0.5 bg-gray-800 text-gray-400 rounded">{c}</span>
        ))}
      </div>
    </div>
  );
}
