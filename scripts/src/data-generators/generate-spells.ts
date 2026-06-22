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
const SOURCE_FILES = [
  "spells-phb.json",
  "spells-xphb.json",
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
}

export const spellSchools = ["Abjuration","Conjuration","Divination","Enchantment","Evocation","Illusion","Necromancy","Transmutation"];
export const spellClasses = ["Artificer","Bard","Cleric","Druid","Paladin","Ranger","Sorcerer","Warlock","Wizard"];

export const spellData: Spell[] = ${tsLiteral(unique)};
`;

  writeOutput(path.join(DM_DATA_DIR, "spells.ts"), header + body);
}

main();
