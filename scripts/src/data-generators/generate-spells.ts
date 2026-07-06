// Read every 5etools spell source the legacy import script knew about, parse
// each spell into the {@link Spell} shape consumed by the Wizard's Tome
// widget, dedupe by lower-cased name (PHB/XPHB win ties), and write the
// result to artifacts/dm-screen/src/data/spells.ts.

import path from "node:path";

import {
  FIVETOOLS_DATA_DIR,
  DM_DATA_DIR,
  existsFile,
  readJSON,
  renderEntries,
  stripTags,
  generatedHeader,
  tsLiteral,
  writeOutput,
} from "./lib.js";

// Hardcoded source list from the legacy importer. Order matters: earlier
// files win ties when two sources publish a spell with the same name.
// XPHB (2024 PHB) is listed before PHB so 2024 readings win — matches the
// monster generator's XMM > MM preference and keeps dice values current
// (e.g. Cure Wounds went 1d8 → 2d8 in 2024).
const SOURCE_FILES = [
  "spells-xphb.json",
  "spells-phb.json",
  "spells-xge.json",
  "spells-tce.json",
  "spells-egw.json",
  "spells-ggr.json",
  "spells-ftd.json",
  "spells-aag.json",
  "spells-ai.json",
  "spells-aitfr-avt.json",
  "spells-bmt.json",
  "spells-efa.json",
  "spells-frhof.json",
  "spells-idrotf.json",
  "spells-llk.json",
  "spells-sato.json",
  "spells-scc.json",
];

const SCHOOLS: Record<string, string> = {
  A: "Abjuration",
  C: "Conjuration",
  D: "Divination",
  E: "Enchantment",
  V: "Evocation",
  Ev: "Evocation",
  I: "Illusion",
  N: "Necromancy",
  T: "Transmutation",
  P: "Conjuration",
};

interface FiveToolsSpell {
  name: string;
  source?: string;
  level?: number;
  school?: string;
  time?: Array<{ number?: number; unit?: string; condition?: string }>;
  range?: {
    type?: string;
    distance?: { type?: string; amount?: number };
  };
  components?: {
    v?: boolean;
    s?: boolean;
    r?: boolean;
    m?: string | { text?: string };
  };
  duration?: Array<{
    type?: string;
    concentration?: boolean;
    duration?: { amount?: number; type?: string };
    ends?: string[];
  }>;
  classes?: {
    fromClassList?: Array<{ name?: string; className?: string }>;
    fromClassListVariant?: Array<{ name?: string; className?: string }>;
    fromSubclass?: Array<{ name?: string; className?: string }>;
  };
  entries?: unknown;
  entriesHigherLevel?: unknown;
  meta?: { ritual?: boolean };
  damageInflict?: string[];
  // 5etools convention: miscTags array, "HL" flag = "Healing".
  miscTags?: string[];
  // Cantrip auto-scaling. May be a single object or an array of them.
  scalingLevelDice?:
    | ScalingLevelDice
    | ScalingLevelDice[];
}

interface ScalingLevelDice {
  label?: string;
  scaling?: Record<string, string>; // { "1": "1d10", "5": "2d10", ... }
}

interface Spell {
  name: string;
  level: number;
  school: string;
  castingTime: string;
  range: string;
  components: string;
  duration: string;
  classes: string[];
  description: string;
  ritual?: boolean;
  concentration?: boolean;
  upcast?: string;
  damage?: SpellDamage;
  healing?: SpellHealing;
}

interface SpellDamage {
  dice: string;
  type: string;
  scaling?: string;
}

interface SpellHealing {
  /** Healing dice or flat amount — e.g. "2d8" for Cure Wounds, "70" for Heal. */
  dice: string;
  /** Optional slot-upcast note, e.g. "+1d8 per slot above 1". */
  scaling?: string;
}

function parseTime(time: FiveToolsSpell["time"]): string {
  if (!time?.length) return "1 action";
  const t = time[0]!;
  const num = t.number ?? 1;
  const unit = t.unit ?? "action";
  let out = `${num} ${unit}`;
  if (t.condition) out += ` (${stripTags(t.condition)})`;
  return out;
}

function parseRange(range: FiveToolsSpell["range"]): string {
  if (!range) return "Self";
  const type = range.type;
  if (type === "special") return "Special";
  if (type === "point") {
    const dist = range.distance;
    if (!dist) return "Self";
    if (dist.type === "self") return "Self";
    if (dist.type === "touch") return "Touch";
    if (dist.type === "sight") return "Sight";
    if (dist.type === "unlimited") return "Unlimited";
    return `${dist.amount} ${dist.type}`;
  }
  if (
    type === "radius" ||
    type === "cone" ||
    type === "line" ||
    type === "cube" ||
    type === "sphere" ||
    type === "hemisphere" ||
    type === "cylinder"
  ) {
    const dist = range.distance;
    if (dist) return `Self (${dist.amount}-${dist.type} ${type})`;
    return `Self (${type})`;
  }
  return "Self";
}

function parseComponents(comp: FiveToolsSpell["components"]): string {
  if (!comp) return "";
  const parts: string[] = [];
  if (comp.v) parts.push("V");
  if (comp.s) parts.push("S");
  if (comp.m) {
    const mat = typeof comp.m === "string" ? comp.m : (comp.m.text ?? "");
    parts.push(`M (${stripTags(mat)})`);
  }
  if (comp.r) parts.push("R");
  return parts.join(", ");
}

function parseDuration(duration: FiveToolsSpell["duration"]): string {
  if (!duration?.length) return "Instantaneous";
  const d = duration[0]!;
  const conc = d.concentration ? " (concentration)" : "";
  if (d.type === "instant") return "Instantaneous";
  if (d.type === "permanent") {
    if (d.ends?.includes("dispel")) return "Until dispelled";
    return "Permanent";
  }
  if (d.type === "special") return "Special";
  if (d.type === "timed" && d.duration) {
    const amt = d.duration.amount ?? 1;
    const unit = d.duration.type ?? "round";
    return `${amt} ${unit}${conc}`;
  }
  return "Instantaneous";
}

function parseClasses(classesObj: FiveToolsSpell["classes"]): string[] {
  if (!classesObj) return [];
  const set = new Set<string>();
  for (const src of [
    "fromClassList",
    "fromClassListVariant",
    "fromSubclass",
  ] as const) {
    for (const c of classesObj[src] ?? []) {
      const name = c.className ?? c.name;
      if (name) set.add(name);
    }
  }
  return [...set].sort();
}

// 5etools v2+ keeps class membership out of the per-spell records and in a
// separate sources.json index keyed by source → spell name → class[]. Pull it
// once, then look each spell up while parsing.
type SourcesIndex = Record<
  string,
  Record<
    string,
    {
      class?: Array<{ name?: string; source?: string }>;
    }
  >
>;

function classesFromIndex(
  index: SourcesIndex,
  source: string | undefined,
  name: string,
): string[] {
  if (!source) return [];
  const entry = index[source]?.[name];
  if (!entry?.class?.length) return [];
  const set = new Set<string>();
  for (const c of entry.class) {
    if (c.name) set.add(c.name);
  }
  return [...set].sort();
}

// Walk the structured `entries` tree (5etools JSON, not free text) and pull
// the first {@damage <dice>} or {@scaledice <dice>|...} macro. We're matching
// documented markup inside a typed field — not regexing arbitrary prose.
function findFirstDamageDice(entries: unknown): string | null {
  if (entries == null) return null;
  if (typeof entries === "string") {
    const m =
      entries.match(/\{@damage\s+([^}|]+)\}/) ??
      entries.match(/\{@h\}[^{]*?\{@damage\s+([^}|]+)\}/);
    return m?.[1]?.trim() ?? null;
  }
  if (Array.isArray(entries)) {
    for (const e of entries) {
      const hit = findFirstDamageDice(e);
      if (hit) return hit;
    }
    return null;
  }
  if (typeof entries === "object") {
    for (const v of Object.values(entries as Record<string, unknown>)) {
      const hit = findFirstDamageDice(v);
      if (hit) return hit;
    }
  }
  return null;
}

// Walk for the first {@scaledamage <base>|<levelRange>|<step>} macro inside
// entriesHigherLevel. Returns the parsed payload or null.
function findFirstScaleDamage(entries: unknown): {
  base: string;
  step: string;
  range: string;
} | null {
  if (entries == null) return null;
  if (typeof entries === "string") {
    const m = entries.match(/\{@scaledamage\s+([^}]+)\}/);
    if (!m) return null;
    const parts = m[1]!.split("|");
    return {
      base: parts[0]?.trim() ?? "",
      range: parts[1]?.trim() ?? "",
      step: parts[2]?.trim() ?? "",
    };
  }
  if (Array.isArray(entries)) {
    for (const e of entries) {
      const hit = findFirstScaleDamage(e);
      if (hit) return hit;
    }
    return null;
  }
  if (typeof entries === "object") {
    for (const v of Object.values(entries as Record<string, unknown>)) {
      const hit = findFirstScaleDamage(v);
      if (hit) return hit;
    }
  }
  return null;
}

// Render scalingLevelDice (cantrip auto-scaling) into a compact human label.
// Handles both the single-object and array-of-objects shapes.
function renderScalingLevelDice(
  raw: FiveToolsSpell["scalingLevelDice"],
): string | null {
  if (!raw) return null;
  const blocks = Array.isArray(raw) ? raw : [raw];
  const parts: string[] = [];
  for (const block of blocks) {
    const scaling = block?.scaling;
    if (!scaling) continue;
    // Skip the level-1 entry (it's the base shown next to the dice already)
    // and join the higher tiers as e.g. "2d10 @5 / 3d10 @11 / 4d10 @17".
    const tiers: string[] = [];
    for (const [lvl, dice] of Object.entries(scaling)) {
      if (lvl === "1") continue;
      tiers.push(`${dice} @${lvl}`);
    }
    if (tiers.length > 0) parts.push(tiers.join(" / "));
  }
  return parts.length > 0 ? parts.join("; ") : null;
}

// Walk for the first {@dice <expr>} macro — healing uses @dice rather than
// @damage in 5etools markup.
function findFirstDiceMacro(entries: unknown): string | null {
  if (entries == null) return null;
  if (typeof entries === "string") {
    const m = entries.match(/\{@dice\s+([^}|]+)\}/);
    return m?.[1]?.trim() ?? null;
  }
  if (Array.isArray(entries)) {
    for (const e of entries) {
      const hit = findFirstDiceMacro(e);
      if (hit) return hit;
    }
    return null;
  }
  if (typeof entries === "object") {
    for (const v of Object.values(entries as Record<string, unknown>)) {
      const hit = findFirstDiceMacro(v);
      if (hit) return hit;
    }
  }
  return null;
}

// {@scaledice <base>|<levelRange>|<step>} — used by both damage- and
// healing-upcasting. Returns the parsed parts of the first occurrence.
function findFirstScaleDice(entries: unknown): {
  base: string;
  step: string;
  range: string;
} | null {
  if (entries == null) return null;
  if (typeof entries === "string") {
    const m = entries.match(/\{@scaledice\s+([^}]+)\}/);
    if (!m) return null;
    const parts = m[1]!.split("|");
    return {
      base: parts[0]?.trim() ?? "",
      range: parts[1]?.trim() ?? "",
      step: parts[2]?.trim() ?? "",
    };
  }
  if (Array.isArray(entries)) {
    for (const e of entries) {
      const hit = findFirstScaleDice(e);
      if (hit) return hit;
    }
    return null;
  }
  if (typeof entries === "object") {
    for (const v of Object.values(entries as Record<string, unknown>)) {
      const hit = findFirstScaleDice(v);
      if (hit) return hit;
    }
  }
  return null;
}

function parseHealing(s: FiveToolsSpell): SpellHealing | undefined {
  // miscTags "HL" is the canonical 5etools flag for "this spell heals".
  if (!s.miscTags?.includes("HL")) return undefined;

  // First {@dice ...} macro is the healing roll (e.g. Cure Wounds 2d8).
  // For flat-amount spells like Heal (70 HP) there's no @dice, so we fall
  // back to the base of the @scaledice macro which carries the flat number.
  const dice =
    findFirstDiceMacro(s.entries) ??
    findFirstScaleDice(s.entries)?.base ??
    findFirstScaleDice(s.entriesHigherLevel)?.base ??
    null;
  if (!dice) return undefined;

  // Scaling: prefer the scaledice inside the main entries (cantrip / fixed-
  // amount style), otherwise look in entriesHigherLevel (standard slot
  // upcasting).
  const inline = findFirstScaleDice(s.entries);
  const higher = findFirstScaleDice(s.entriesHigherLevel);
  const sd = inline ?? higher;
  let scaling: string | undefined;
  if (sd?.step) {
    const baseSlot = (s.level ?? 0).toString();
    scaling = `+${sd.step} per slot above ${baseSlot}`;
  }

  const out: SpellHealing = { dice };
  if (scaling) out.scaling = scaling;
  return out;
}

function parseDamage(s: FiveToolsSpell): SpellDamage | undefined {
  const type = s.damageInflict?.[0];
  if (!type) return undefined;

  // Prefer cantrip scaling (structured) when available; it's the
  // authoritative source for tiered cantrip dice.
  const scalingBlocks = Array.isArray(s.scalingLevelDice)
    ? s.scalingLevelDice
    : s.scalingLevelDice
      ? [s.scalingLevelDice]
      : [];
  const tier1 = scalingBlocks
    .map((b) => b?.scaling?.["1"])
    .find((d): d is string => typeof d === "string");

  // Otherwise the first {@damage} macro inside entries.
  const dice = tier1 ?? findFirstDamageDice(s.entries);
  if (!dice) return undefined;

  // Scaling label: cantrip tiers if present, else the {@scaledamage} payload
  // from entriesHigherLevel (slot upcasting).
  let scalingLabel: string | undefined;
  const cantripLabel = renderScalingLevelDice(s.scalingLevelDice);
  if (cantripLabel) {
    scalingLabel = cantripLabel;
  } else {
    const sd = findFirstScaleDamage(s.entriesHigherLevel);
    if (sd?.step) {
      // Format: "+1d6 per slot above 3rd"
      const baseSlot = (s.level ?? 0).toString();
      scalingLabel = `+${sd.step} per slot above ${baseSlot}`;
    }
  }

  const damage: SpellDamage = { dice, type };
  if (scalingLabel) damage.scaling = scalingLabel;
  return damage;
}

function parseSpell(s: FiveToolsSpell, sourcesIndex: SourcesIndex): Spell {
  const description = renderEntries(s.entries);
  const upcastText = s.entriesHigherLevel
    ? renderEntries(s.entriesHigherLevel)
    : undefined;
  const ritual = Boolean(s.meta?.ritual);
  const concentration = Boolean(s.duration?.[0]?.concentration);
  // Prefer the per-spell classes block when present (legacy schema); fall
  // back to the v2+ external sources.json index.
  let classes = parseClasses(s.classes);
  if (classes.length === 0) {
    classes = classesFromIndex(sourcesIndex, s.source, s.name);
  }
  const out: Spell = {
    name: s.name,
    level: s.level ?? 0,
    school: SCHOOLS[s.school ?? ""] ?? s.school ?? "Unknown",
    castingTime: parseTime(s.time),
    range: parseRange(s.range),
    components: parseComponents(s.components),
    duration: parseDuration(s.duration),
    classes,
    description,
  };
  if (ritual) out.ritual = true;
  if (concentration) out.concentration = true;
  if (upcastText) out.upcast = upcastText;
  const damage = parseDamage(s);
  if (damage) out.damage = damage;
  const healing = parseHealing(s);
  if (healing) out.healing = healing;
  return out;
}

function main() {
  console.log(`Reading 5etools spells from ${FIVETOOLS_DATA_DIR}/spells/`);
  const sourcesPath = path.join(FIVETOOLS_DATA_DIR, "spells/sources.json");
  const sourcesIndex = existsFile(sourcesPath)
    ? readJSON<SourcesIndex>(sourcesPath)
    : ({} as SourcesIndex);
  if (!existsFile(sourcesPath)) {
    console.warn("  (no sources.json — class membership will be empty)");
  }

  const seen = new Map<string, Spell>();
  let total = 0;

  for (const file of SOURCE_FILES) {
    const p = path.join(FIVETOOLS_DATA_DIR, "spells", file);
    if (!existsFile(p)) {
      console.warn(`  ✗ ${file}: not found in clone (skipping)`);
      continue;
    }
    const json = readJSON<{ spell?: FiveToolsSpell[] }>(p);
    const list = json.spell ?? [];
    console.log(`  ✓ ${file}: ${list.length} spells`);
    for (const raw of list) {
      total++;
      const parsed = parseSpell(raw, sourcesIndex);
      const key = parsed.name.toLowerCase();
      if (!seen.has(key)) seen.set(key, parsed);
    }
  }

  const unique = [...seen.values()].sort((a, b) => {
    if (a.level !== b.level) return a.level - b.level;
    return a.name.localeCompare(b.name);
  });

  console.log(
    `\nTotal raw entries: ${total}; unique by name: ${unique.length}`,
  );

  const header = generatedHeader({
    source: "../5etools-src/data/spells/*.json",
    generator: "generate-spells.ts",
    count: unique.length,
  });

  const body = `
export interface Spell {
  name: string;
  level: number;
  school: string;
  castingTime: string;
  range: string;
  components: string;
  duration: string;
  classes: string[];
  description: string;
  ritual?: boolean;
  concentration?: boolean;
  upcast?: string;
  damage?: SpellDamage;
  healing?: SpellHealing;
}

export interface SpellDamage {
  /** Base dice expression — e.g. "8d6" for Fireball or "1d10" for a cantrip's
   *  tier-1 damage. */
  dice: string;
  /** Canonical damage type — e.g. "fire", "force", "radiant". */
  type: string;
  /** Optional human-readable scaling note. Cantrip tier scaling
   *  (e.g. "2d10 @5 / 3d10 @11 / 4d10 @17") or slot upcasting
   *  (e.g. "+1d6 per slot above 3"). */
  scaling?: string;
}

export interface SpellHealing {
  /** Healing dice or flat amount — e.g. "2d8" for Cure Wounds, "70" for Heal. */
  dice: string;
  /** Optional slot-upcast note, e.g. "+1d8 per slot above 1". */
  scaling?: string;
}

export const spellSchools = ["Abjuration","Conjuration","Divination","Enchantment","Evocation","Illusion","Necromancy","Transmutation"];
export const spellClasses = ["Artificer","Bard","Cleric","Druid","Paladin","Ranger","Sorcerer","Warlock","Wizard"];

export const spellData: Spell[] = ${tsLiteral(unique)};
`;

  writeOutput(path.join(DM_DATA_DIR, "spells.ts"), header + body);
}

main();
