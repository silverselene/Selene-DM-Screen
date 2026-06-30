// Refresh the curated bestiary subset. The list of *which* monsters to ship
// comes from the existing artifacts/dm-screen/src/data/bestiary.ts (40 names)
// — same set, refreshed against 5etools v2.31.0 stat blocks so wording and
// values track the 2024 rules where the XMM (2024 Monster Manual) entry
// exists, falling back to MM and friends otherwise.
//
// The output keeps the existing local Monster shape so the Bestiary widget
// doesn't need to change.

import fs from "node:fs";
import path from "node:path";

import {
  FIVETOOLS_DATA_DIR,
  DM_DATA_DIR,
  readJSON,
  renderEntries,
  stripTags,
  generatedHeader,
  tsLiteral,
  writeOutput,
} from "./lib.js";

// Preferred sources, highest first. XMM = 2024 Monster Manual; MM = 2014.
const SOURCE_PRIORITY = ["XMM", "MM", "MPMM", "VGM", "MTF", "MM2"];

const SIZE_MAP: Record<string, string> = {
  T: "Tiny",
  S: "Small",
  M: "Medium",
  L: "Large",
  H: "Huge",
  G: "Gargantuan",
};

const ALIGN_MAP: Record<string, string> = {
  L: "lawful",
  N: "neutral",
  C: "chaotic",
  G: "good",
  E: "evil",
  U: "unaligned",
  A: "any alignment",
};

const SKILL_NAMES: Record<string, string> = {
  acrobatics: "Acrobatics",
  "animal handling": "Animal Handling",
  arcana: "Arcana",
  athletics: "Athletics",
  deception: "Deception",
  history: "History",
  insight: "Insight",
  intimidation: "Intimidation",
  investigation: "Investigation",
  medicine: "Medicine",
  nature: "Nature",
  perception: "Perception",
  performance: "Performance",
  persuasion: "Persuasion",
  religion: "Religion",
  "sleight of hand": "Sleight of Hand",
  stealth: "Stealth",
  survival: "Survival",
};

const ABILITY_LABEL: Record<string, string> = {
  str: "Str",
  dex: "Dex",
  con: "Con",
  int: "Int",
  wis: "Wis",
  cha: "Cha",
};

interface FiveToolsTrait {
  name?: string;
  entries?: unknown;
}

interface FiveToolsMonster {
  name: string;
  source: string;
  size?: string[];
  type?: string | { type?: string; tags?: Array<string | { tag?: string }> };
  alignment?: Array<string | { alignment?: string[] }>;
  ac?: Array<
    | number
    | {
        ac?: number;
        from?: string[];
        condition?: string;
      }
  >;
  hp?: { average?: number; formula?: string; special?: string };
  speed?:
    | string
    | {
        walk?: number | { number?: number; condition?: string };
        fly?: number | { number?: number; condition?: string };
        swim?: number | { number?: number; condition?: string };
        climb?: number | { number?: number; condition?: string };
        burrow?: number | { number?: number; condition?: string };
        canHover?: boolean;
      };
  str?: number;
  dex?: number;
  con?: number;
  int?: number;
  wis?: number;
  cha?: number;
  save?: Record<string, string>;
  skill?: Record<string, string>;
  senses?: string[];
  passive?: number;
  languages?: string[];
  cr?: string | { cr?: string };
  immune?: unknown[];
  resist?: unknown[];
  vulnerable?: unknown[];
  conditionImmune?: unknown[];
  damageTags?: string[];
  trait?: FiveToolsTrait[];
  action?: FiveToolsTrait[];
  reaction?: FiveToolsTrait[];
  legendary?: FiveToolsTrait[];
  legendaryHeader?: unknown;
}

interface MonsterTrait {
  name: string;
  desc: string;
}

interface Monster {
  name: string;
  size: string;
  type: string;
  alignment: string;
  ac: number;
  acType: string;
  hp: string;
  speed: string;
  str: number;
  dex: number;
  con: number;
  int: number;
  wis: number;
  cha: number;
  savingThrows?: string;
  skills?: string;
  damageImmunities?: string;
  damageResistances?: string;
  damageVulnerabilities?: string;
  conditionImmunities?: string;
  senses: string;
  languages: string;
  cr: string;
  traits?: MonsterTrait[];
  actions: MonsterTrait[];
  reactions?: MonsterTrait[];
  legendaryActions?: MonsterTrait[];
}

function formatSize(size: string[] | undefined): string {
  if (!size?.length) return "Medium";
  return SIZE_MAP[size[0]!] ?? "Medium";
}

function formatType(type: FiveToolsMonster["type"]): string {
  if (!type) return "unknown";
  if (typeof type === "string") return type;
  const base = type.type ?? "unknown";
  const tags = (type.tags ?? [])
    .map((t) => (typeof t === "string" ? t : t.tag))
    .filter(Boolean) as string[];
  return tags.length > 0 ? `${base} (${tags.join(", ")})` : base;
}

function formatAlignment(
  alignment: FiveToolsMonster["alignment"],
): string {
  if (!alignment?.length) return "unaligned";
  const parts = alignment
    .map((a) => {
      if (typeof a === "string") return ALIGN_MAP[a] ?? a;
      if (a && typeof a === "object" && Array.isArray(a.alignment)) {
        return a.alignment.map((x) => ALIGN_MAP[x] ?? x).join(" ");
      }
      return null;
    })
    .filter((p): p is string => Boolean(p));
  return parts.join(" ") || "unaligned";
}

function formatAC(ac: FiveToolsMonster["ac"]): {
  ac: number;
  acType: string;
} {
  if (!ac?.length) return { ac: 10, acType: "" };
  const first = ac[0]!;
  if (typeof first === "number") return { ac: first, acType: "" };
  const value = first.ac ?? 10;
  const from = first.from?.map((f) => stripTags(f)).filter(Boolean) ?? [];
  const acType = from.join(", ");
  return { ac: value, acType };
}

function formatHP(hp: FiveToolsMonster["hp"]): string {
  if (!hp) return "0";
  if (hp.special) return stripTags(hp.special);
  if (hp.average != null && hp.formula)
    return `${hp.average} (${stripTags(hp.formula)})`;
  if (hp.average != null) return String(hp.average);
  return "0";
}

function speedSegment(
  label: string,
  v: unknown,
): string | null {
  if (v == null) return null;
  if (typeof v === "number") {
    return label === "walk" ? `${v} ft.` : `${label} ${v} ft.`;
  }
  if (typeof v === "object") {
    const obj = v as { number?: number; condition?: string };
    if (obj.number == null) return null;
    const cond = obj.condition ? ` (${stripTags(obj.condition)})` : "";
    return label === "walk"
      ? `${obj.number} ft.${cond}`
      : `${label} ${obj.number} ft.${cond}`;
  }
  return null;
}

function formatSpeed(speed: FiveToolsMonster["speed"]): string {
  if (!speed) return "0 ft.";
  if (typeof speed === "string") return stripTags(speed);
  const segments: string[] = [];
  for (const key of ["walk", "burrow", "climb", "fly", "swim"] as const) {
    const seg = speedSegment(key, (speed as Record<string, unknown>)[key]);
    if (seg) segments.push(seg);
  }
  if (speed.canHover) segments.push("hover");
  return segments.join(", ") || "0 ft.";
}

function formatSaves(save: Record<string, string> | undefined): string | null {
  if (!save) return null;
  const parts: string[] = [];
  for (const key of ["str", "dex", "con", "int", "wis", "cha"] as const) {
    if (save[key]) parts.push(`${ABILITY_LABEL[key]} ${save[key]}`);
  }
  return parts.length > 0 ? parts.join(", ") : null;
}

function formatSkills(
  skill: Record<string, string> | undefined,
): string | null {
  if (!skill) return null;
  const parts: string[] = [];
  for (const [name, bonus] of Object.entries(skill)) {
    const label = SKILL_NAMES[name.toLowerCase()] ?? name;
    parts.push(`${label} ${bonus}`);
  }
  return parts.length > 0 ? parts.join(", ") : null;
}

function formatDamageList(list: unknown[] | undefined): string | null {
  if (!list?.length) return null;
  const parts: string[] = [];
  for (const item of list) {
    if (typeof item === "string") {
      parts.push(item);
      continue;
    }
    if (item && typeof item === "object") {
      const obj = item as {
        immune?: string[];
        resist?: string[];
        vulnerable?: string[];
        note?: string;
        preNote?: string;
        cond?: boolean;
      };
      const inner =
        obj.immune ?? obj.resist ?? obj.vulnerable ?? [];
      const innerText = inner.join(", ");
      const note = obj.note ? ` ${stripTags(obj.note)}` : "";
      const pre = obj.preNote ? `${stripTags(obj.preNote)} ` : "";
      if (innerText) parts.push(`${pre}${innerText}${note}`.trim());
      else if (note.trim()) parts.push(note.trim());
    }
  }
  return parts.length > 0 ? parts.join("; ") : null;
}

function formatSenses(
  senses: string[] | undefined,
  passive: number | undefined,
): string {
  const parts: string[] = [];
  for (const s of senses ?? []) parts.push(stripTags(s));
  if (passive != null) parts.push(`passive Perception ${passive}`);
  return parts.join(", ") || "—";
}

function formatLanguages(languages: string[] | undefined): string {
  if (!languages?.length) return "—";
  return languages.map((l) => stripTags(l)).join(", ");
}

function formatCR(cr: FiveToolsMonster["cr"]): string {
  if (cr == null) return "0";
  if (typeof cr === "string") return cr;
  return cr.cr ?? "0";
}

function renderTraits(
  traits: FiveToolsTrait[] | undefined,
): MonsterTrait[] {
  if (!traits?.length) return [];
  return traits
    .filter((t) => t.name)
    .map((t) => ({
      name: stripTags(t.name ?? ""),
      desc: renderEntries(t.entries),
    }));
}

function pickMonster(
  candidates: Array<FiveToolsMonster & { _file: string }>,
): FiveToolsMonster & { _file: string } {
  // Highest source priority wins; otherwise first found.
  let best = candidates[0]!;
  let bestRank = SOURCE_PRIORITY.indexOf(best.source);
  if (bestRank === -1) bestRank = SOURCE_PRIORITY.length;
  for (const c of candidates.slice(1)) {
    let rank = SOURCE_PRIORITY.indexOf(c.source);
    if (rank === -1) rank = SOURCE_PRIORITY.length;
    if (rank < bestRank) {
      best = c;
      bestRank = rank;
    }
  }
  return best;
}

function transform(
  src: FiveToolsMonster,
): Monster {
  const { ac, acType } = formatAC(src.ac);
  const out: Monster = {
    name: src.name,
    size: formatSize(src.size),
    type: formatType(src.type),
    alignment: formatAlignment(src.alignment),
    ac,
    acType,
    hp: formatHP(src.hp),
    speed: formatSpeed(src.speed),
    str: src.str ?? 10,
    dex: src.dex ?? 10,
    con: src.con ?? 10,
    int: src.int ?? 10,
    wis: src.wis ?? 10,
    cha: src.cha ?? 10,
    senses: formatSenses(src.senses, src.passive),
    languages: formatLanguages(src.languages),
    cr: formatCR(src.cr),
    actions: renderTraits(src.action),
  };
  const saves = formatSaves(src.save);
  if (saves) out.savingThrows = saves;
  const skills = formatSkills(src.skill);
  if (skills) out.skills = skills;
  const immune = formatDamageList(src.immune);
  if (immune) out.damageImmunities = immune;
  const resist = formatDamageList(src.resist);
  if (resist) out.damageResistances = resist;
  const vuln = formatDamageList(src.vulnerable);
  if (vuln) out.damageVulnerabilities = vuln;
  const condImmune = formatDamageList(src.conditionImmune);
  if (condImmune) out.conditionImmunities = condImmune;
  const traits = renderTraits(src.trait);
  if (traits.length > 0) out.traits = traits;
  const reactions = renderTraits(src.reaction);
  if (reactions.length > 0) out.reactions = reactions;
  const legendary = renderTraits(src.legendary);
  if (legendary.length > 0) out.legendaryActions = legendary;
  return out;
}

function extractCanonicalNames(): string[] {
  // Pull the canonical 40-name list. This script overwrites bestiary.ts, so
  // we need to find outer-level `name:` lines deterministically:
  //   - in the original hand-written file (5-space indent: "    name:")
  //   - in our own generated layout (4-space indent: "    name:")
  // Both happen to be exactly 4 leading spaces, so anchor to that and
  // explicitly exclude deeper-nested `name:` keys.
  const p = path.join(DM_DATA_DIR, "bestiary.ts");
  const text = fs.readFileSync(p, "utf-8");
  const set = new Set<string>();
  for (const m of text.matchAll(/^ {4}name: "([^"]+)",/gm)) {
    set.add(m[1]!);
  }
  return [...set].sort();
}

function indexBestiary(): Map<
  string,
  Array<FiveToolsMonster & { _file: string }>
> {
  const dir = path.join(FIVETOOLS_DATA_DIR, "bestiary");
  const files = fs.readdirSync(dir).filter((f) => f.startsWith("bestiary-"));
  const index = new Map<
    string,
    Array<FiveToolsMonster & { _file: string }>
  >();
  for (const f of files) {
    const json = readJSON<{ monster?: FiveToolsMonster[] }>(
      path.join(dir, f),
    );
    for (const m of json.monster ?? []) {
      const key = m.name.toLowerCase();
      const arr = index.get(key) ?? [];
      arr.push({ ...m, _file: f });
      index.set(key, arr);
    }
  }
  return index;
}

function main() {
  console.log("Reading curated monster list from bestiary.ts");
  const names = extractCanonicalNames();
  console.log(`  ${names.length} canonical names`);

  console.log(`Indexing 5etools bestiary at ${FIVETOOLS_DATA_DIR}/bestiary/`);
  const index = indexBestiary();
  console.log(`  ${index.size} unique monster names across all sources`);

  const refreshed: Monster[] = [];
  const missing: string[] = [];
  for (const name of names) {
    const candidates = index.get(name.toLowerCase());
    if (!candidates?.length) {
      missing.push(name);
      console.warn(`  ✗ ${name}: no match in 5etools`);
      continue;
    }
    const picked = pickMonster(candidates);
    console.log(`  ✓ ${name}  ← ${picked._file} (${picked.source})`);
    refreshed.push(transform(picked));
  }

  if (missing.length > 0) {
    console.error(`\nERROR: ${missing.length} monsters had no 5etools match:`);
    for (const m of missing) console.error(`  - ${m}`);
    process.exit(1);
  }

  refreshed.sort((a, b) => a.name.localeCompare(b.name));

  const header = generatedHeader({
    source: "../5etools-src/data/bestiary/bestiary-*.json",
    generator: "generate-monsters.ts",
    count: refreshed.length,
  });

  const body = `
export interface MonsterTrait {
  name: string;
  desc: string;
}

export interface Monster {
  name: string;
  size: string;
  type: string;
  alignment: string;
  ac: number;
  acType: string;
  hp: string;
  speed: string;
  str: number;
  dex: number;
  con: number;
  int: number;
  wis: number;
  cha: number;
  savingThrows?: string;
  skills?: string;
  damageImmunities?: string;
  damageResistances?: string;
  damageVulnerabilities?: string;
  conditionImmunities?: string;
  senses: string;
  languages: string;
  cr: string;
  traits?: MonsterTrait[];
  actions: MonsterTrait[];
  reactions?: MonsterTrait[];
  legendaryActions?: MonsterTrait[];
}

export function mod(score: number): string {
  const m = Math.floor((score - 10) / 2);
  return m >= 0 ? \`+\${m}\` : \`\${m}\`;
}

export const crOrder = [
  "0", "1/8", "1/4", "1/2", "1", "2", "3", "4", "5",
  "6", "7", "8", "9", "10", "11", "12", "13", "14", "15",
  "16", "17", "18", "19", "20", "21", "22", "23", "24", "25", "30",
];

export function crToNumber(cr: string): number {
  if (cr === "1/8") return 0.125;
  if (cr === "1/4") return 0.25;
  if (cr === "1/2") return 0.5;
  // Whole-number CRs (0–30) plus the thin index's decimal fractions
  // ("0.5", "0.25", "0.125"). Anything else — an empty string, "Unknown",
  // or a malformed "11/2" that parseFloat would silently misread as 11 — is
  // treated as ungraded: sorted to the end and coloured neutrally by callers.
  return /^\\d+(\\.\\d+)?$/.test(cr) ? parseFloat(cr) : Number.POSITIVE_INFINITY;
}

export const bestiaryData: Monster[] = ${tsLiteral(refreshed)};
`;

  writeOutput(path.join(DM_DATA_DIR, "bestiary.ts"), header + body);
}

main();
