// Structured card for a weapon in the Compendium: damage, range, properties,
// Weapon Mastery, weight / cost, and (for magic weapons) the item text.
// Every property and mastery chip toggles its rules text inline, so "what
// does Finesse / Nick do?" is answered without leaving the card.

import { useState, type ReactNode } from "react";
import { Sword, Crosshair, Weight, Coins, Sparkles } from "lucide-react";

import type { Weapon, WeaponRule } from "@/data/weapons";
import {
  isSpecialWeapon,
  masteryRuleFor,
  propertyRuleFor,
  weaponRange,
  weaponTypeLine,
  weaponVersatile,
} from "@/lib/weaponCompendium";

type OpenRule = { kind: "property" | "mastery"; label: string; rule: WeaponRule | null };

export function WeaponCard({ weapon }: { weapon: Weapon }) {
  const [open, setOpen] = useState<OpenRule | null>(null);
  const mastery = weapon.mastery ?? [];
  const range = weaponRange(weapon);
  const versatile = weaponVersatile(weapon);

  const toggle = (next: OpenRule) =>
    setOpen((cur) => (cur && cur.kind === next.kind && cur.label === next.label ? null : next));
  const isOpen = (kind: OpenRule["kind"], label: string) =>
    open?.kind === kind && open.label === label;

  return (
    <div className="bg-gray-900/80 border border-amber-800/40 rounded p-3 space-y-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-base font-bold text-white">{weapon.name}</h3>
          <p className="text-sm italic text-gray-400">{weaponTypeLine(weapon)}</p>
        </div>
        <span className="text-sm text-amber-400 bg-amber-900/30 px-2 py-0.5 rounded-full shrink-0">
          Weapons
        </span>
      </div>

      {/* Key numbers */}
      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
        <Stat icon={<Sword className="w-3.5 h-3.5" />} label="Damage" wide>
          {weapon.damage ? (
            <span className="font-mono font-semibold text-amber-300">
              {weapon.damage}
              {weapon.damage_type ? ` ${weapon.damage_type}` : ""}
            </span>
          ) : (
            "—"
          )}
        </Stat>
        {versatile && (
          <Stat label="Two-handed">
            <span className="font-mono font-semibold text-amber-300">{versatile}</span>
          </Stat>
        )}
        {range && (
          <Stat icon={<Crosshair className="w-3.5 h-3.5" />} label="Range">
            {range} ft.
          </Stat>
        )}
        {weapon.weight && (
          <Stat icon={<Weight className="w-3.5 h-3.5" />} label="Weight">
            {weapon.weight}
          </Stat>
        )}
        {weapon.cost && (
          <Stat icon={<Coins className="w-3.5 h-3.5" />} label="Cost">
            {weapon.cost}
          </Stat>
        )}
        {isSpecialWeapon(weapon) &&
          weapon.stats.map((st) => (
            <Stat key={st.label} label={st.label} wide={st.value.length > 12}>
              {st.value}
            </Stat>
          ))}
      </div>

      {/* Mastery + properties — each chip explains itself */}
      {(mastery.length > 0 || weapon.properties.length > 0) && (
        <div className="flex flex-wrap gap-1">
          {mastery.map((m) => (
            <button
              key={`m-${m}`}
              type="button"
              aria-expanded={isOpen("mastery", m)}
              onClick={() => toggle({ kind: "mastery", label: m, rule: masteryRuleFor(m) })}
              className={`inline-flex items-center gap-1 text-[12px] px-1.5 py-0.5 rounded border transition-colors ${
                isOpen("mastery", m)
                  ? "bg-purple-700/50 border-purple-400 text-white"
                  : "bg-purple-900/40 border-purple-700/60 text-purple-200 hover:bg-purple-800/50"
              }`}
              title={`What does the ${m} mastery do?`}
            >
              <Sparkles className="w-3 h-3" />
              Mastery: {m}
            </button>
          ))}
          {weapon.properties.map((p) => (
            <button
              key={`p-${p}`}
              type="button"
              aria-expanded={isOpen("property", p)}
              onClick={() => toggle({ kind: "property", label: p, rule: propertyRuleFor(p) })}
              className={`text-[12px] px-1.5 py-0.5 rounded border transition-colors ${
                isOpen("property", p)
                  ? "bg-amber-700/40 border-amber-500 text-white"
                  : "bg-gray-800 border-gray-700 text-gray-300 hover:border-amber-700/70"
              }`}
              title={`What does ${p} mean?`}
            >
              {p}
            </button>
          ))}
        </div>
      )}

      {open && (
        <div
          role="region"
          aria-label={`${open.kind === "mastery" ? "Mastery" : "Property"}: ${open.label}`}
          className={`text-sm rounded border px-2.5 py-2 leading-relaxed ${
            open.kind === "mastery"
              ? "bg-purple-950/40 border-purple-800/50 text-purple-100"
              : "bg-amber-950/30 border-amber-800/40 text-amber-50"
          }`}
        >
          <p className="font-semibold mb-0.5">
            {open.kind === "mastery" ? `Weapon Mastery: ${open.label}` : open.rule?.name ?? open.label}
          </p>
          <p className="whitespace-pre-line">
            {open.rule?.description ?? "No rules text on file for this property."}
          </p>
          {open.kind === "mastery" && (
            <p className="mt-1 text-[12px] text-purple-300/80">
              Only creatures with the Weapon Mastery feature (e.g. Barbarian, Fighter, Paladin,
              Ranger, Rogue) can use a weapon's mastery property.
            </p>
          )}
        </div>
      )}

      {weapon.description && (
        <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-line border-t border-gray-800 pt-2">
          {weapon.description}
        </p>
      )}

      {/* A special weapon's per-use choices (Unarmed Strike: Damage /
          Grapple / Shove) — the core of the card, so always shown. */}
      {isSpecialWeapon(weapon) && (
        <div className="space-y-1.5">
          {weapon.options.map((o) => (
            <div
              key={o.name}
              className="rounded border border-amber-900/40 bg-amber-950/20 px-2.5 py-1.5"
            >
              <p className="text-sm font-semibold text-amber-300">{o.name}</p>
              <p className="text-sm text-gray-300 leading-relaxed">{o.description}</p>
            </div>
          ))}
          <p className="text-[12px] text-gray-500 italic">{weapon.note}</p>
        </div>
      )}
    </div>
  );
}

// `wide` spans both grid columns — used for Damage, the number the DM came
// for, so "1d4 Piercing" is never truncated in a narrow tile. Values wrap
// rather than ellipsize.
function Stat({
  icon,
  label,
  wide,
  children,
}: {
  icon?: ReactNode;
  label: string;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={`flex items-start gap-1.5 min-w-0 ${wide ? "col-span-2" : ""}`}>
      {icon && <span className="text-gray-500 shrink-0 mt-0.5">{icon}</span>}
      <span className="text-gray-500 shrink-0">{label}:</span>
      <span className="text-gray-200 min-w-0 break-words">{children}</span>
    </div>
  );
}
