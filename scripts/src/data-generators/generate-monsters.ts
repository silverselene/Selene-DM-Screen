// Build the single unified monster dataset the Bestiary and Initiative
// widgets both read from: attached_assets/Monsters_&_Beasts_*.csv supplies
// the thin index (name/AC/HP/CR/size/type/source/environment/page/initiative
// — 2,158 rows). Rich fields (traits/actions/reactions/legendary actions,
// ability scores, etc.) come from two places:
//   1. 5etools v2.31.0 stat blocks — always for CANONICAL_RICH_NAMES (a
//      curated 40-monster subset refreshed against the 2024 rules where the
//      XMM entry exists, falling back to MM and friends otherwise), and
//      additionally for any other CSV row whose name (or a close variant —
//      see resolveFiveToolsKey) matches an official monster. 5etools-src
//      mirrors WotC content only.
//   2. Open5e's structured data (open5e/open5e-api, pinned to v1.12.0) for
//      CSV rows sourced from Kobold Press's Tome of Beasts I–III / Creature
//      Codex or EN Publishing's Level Up A5e Monstrous Menagerie — Open Game
//      Content under the Open Gaming License v1.0a (see OGL-NOTICE.md at the
//      repo root). Matched first against the CSV row's own source book, then
//      against the other four as a fallback.
// A CSV row with no match in either source (custom/homebrew entries, or a
// handful of adventure-specific variants) stays thin — that's expected, not
// a bug. Where a name matches, the rich stat block's ac/hp/cr/size/type/
// alignment win (they're derived straight from the matching rules text); the
// CSV's source/environment/pageNumber/initiativeRoll are kept. Canonical
// 5etools names absent from the CSV entirely (Beholder, Mind Flayer) are
// appended as new entries.

import fs from "node:fs";
import path from "node:path";

import {
  FIVETOOLS_DATA_DIR,
  OPEN5E_DATA_DIR,
  REPO_ROOT,
  DM_DATA_DIR,
  readJSON,
  renderEntries,
  stripTags,
  generatedHeader,
  tsLiteral,
  writeOutput,
} from "./lib.js";
import {
  canonicalPrefersOpen5e,
  cleanOpen5e,
  OPEN5E_SLUG_BY_CSV_SOURCE,
  OPEN5E_SLUGS,
  parseCSV,
  requireColumns,
  resolveFiveToolsKey,
  richMatchesCsv,
  type Open5eSlug,
} from "./monsters-lib.js";

// The curated set of monsters that ship with full stat blocks. Editorial
// choice, not derived data — extend by adding a name here (it must exist in
// the 5etools bestiary JSON).
const CANONICAL_RICH_NAMES = [
  "Aboleth", "Adult Red Dragon", "Ancient Black Dragon", "Bandit",
  "Bandit Captain", "Beholder", "Bugbear", "Dire Wolf", "Dragon Turtle",
  "Drow", "Flesh Golem", "Gelatinous Cube", "Gnoll", "Goblin",
  "Goblin Boss", "Harpy", "Hill Giant", "Hobgoblin", "Hydra", "Imp",
  "Kobold", "Lich", "Merrow", "Mimic", "Mind Flayer", "Ogre", "Orc",
  "Owlbear", "Rakshasa", "Roc", "Skeleton", "Specter", "Tarrasque",
  "Troll", "Vampire", "Werewolf", "Wight", "Wraith", "Young Red Dragon",
  "Zombie",
];

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

const ABILITY_KEYS = ["str", "dex", "con", "int", "wis", "cha"] as const;

const ABILITY_LABEL: Record<(typeof ABILITY_KEYS)[number], string> = {
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

// Thin fields are always present (sourced from the CSV, or defaulted for a
// canonical monster the CSV doesn't carry). Rich fields are only present for
// CANONICAL_RICH_NAMES — check `actions` to tell full stat blocks apart from
// thin entries.
interface MonsterEntry {
  name: string;
  ac: number;
  acType: string;
  hp: string;
  cr: string;
  size: string;
  type: string;
  alignment: string;
  source: string;
  environment: string;
  pageNumber: number | null;
  isLegendary: boolean;
  initiativeModifier: number;
  initiativeRoll: number;
  speed?: string;
  str?: number;
  dex?: number;
  con?: number;
  int?: number;
  wis?: number;
  cha?: number;
  savingThrows?: string;
  skills?: string;
  damageImmunities?: string;
  damageResistances?: string;
  damageVulnerabilities?: string;
  conditionImmunities?: string;
  senses?: string;
  languages?: string;
  traits?: MonsterTrait[];
  actions?: MonsterTrait[];
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

function formatAlignment(alignment: FiveToolsMonster["alignment"]): string {
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

function formatAC(ac: FiveToolsMonster["ac"]): { ac: number; acType: string } {
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

function speedSegment(label: string, v: unknown): string | null {
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
  // Some sources set canHover *and* a "(hover)" condition on the fly segment
  // itself — avoid stating it twice.
  if (speed.canHover && !segments.some((s) => s.includes("(hover)"))) {
    segments.push("hover");
  }
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

function formatSkills(skill: Record<string, string> | undefined): string | null {
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
      const inner = obj.immune ?? obj.resist ?? obj.vulnerable ?? [];
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

function renderTraits(traits: FiveToolsTrait[] | undefined): MonsterTrait[] {
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

// Rich fields only — merged onto (or used to create) a MonsterEntry by the
// caller, which owns the thin fields (source/environment/pageNumber/...).
type RichFields = Pick<
  MonsterEntry,
  | "ac"
  | "acType"
  | "hp"
  | "size"
  | "type"
  | "alignment"
  | "cr"
  | "speed"
  | "senses"
  | "languages"
  | "actions"
  | "savingThrows"
  | "skills"
  | "damageImmunities"
  | "damageResistances"
  | "damageVulnerabilities"
  | "conditionImmunities"
  | "traits"
  | "reactions"
  | "legendaryActions"
> & {
  // transformRich always defaults these to 10, so — unlike MonsterEntry,
  // where they're optional — they're never undefined here.
  str: number;
  dex: number;
  con: number;
  int: number;
  wis: number;
  cha: number;
};

function transformRich(src: FiveToolsMonster): RichFields {
  const { ac, acType } = formatAC(src.ac);
  const out: RichFields = {
    ac,
    acType,
    hp: formatHP(src.hp),
    size: formatSize(src.size),
    type: formatType(src.type),
    alignment: formatAlignment(src.alignment),
    cr: formatCR(src.cr),
    speed: formatSpeed(src.speed),
    str: src.str ?? 10,
    dex: src.dex ?? 10,
    con: src.con ?? 10,
    int: src.int ?? 10,
    wis: src.wis ?? 10,
    cha: src.cha ?? 10,
    senses: formatSenses(src.senses, src.passive),
    languages: formatLanguages(src.languages),
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

function indexBestiary(): Map<string, Array<FiveToolsMonster & { _file: string }>> {
  const dir = path.join(FIVETOOLS_DATA_DIR, "bestiary");
  // Sort the readdir output: for a name whose only candidates all fall outside
  // SOURCE_PRIORITY (equal rank), pickMonster keeps the first-found, so an
  // unsorted, filesystem-dependent readdir order would let a regen on a
  // different machine silently flip which stat block wins.
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.startsWith("bestiary-"))
    .sort();
  const index = new Map<string, Array<FiveToolsMonster & { _file: string }>>();
  for (const f of files) {
    const json = readJSON<{ monster?: FiveToolsMonster[] }>(path.join(dir, f));
    for (const m of json.monster ?? []) {
      const key = m.name.toLowerCase();
      const arr = index.get(key) ?? [];
      arr.push({ ...m, _file: f });
      index.set(key, arr);
    }
  }
  return index;
}

function loadRichByName(thin: ThinFields[]): Map<string, RichFields> {
  console.log(`Indexing 5etools bestiary at ${FIVETOOLS_DATA_DIR}/bestiary/`);
  const index = indexBestiary();
  console.log(`  ${index.size} unique monster names across all sources`);

  const rich = new Map<string, RichFields>();

  // Canonical names (lowercased) that must defer to the Open5e own-book pass:
  // their CSV row is sourced from a third-party (Open5e) book, so attaching the
  // same-name WotC stat block here would mix a WotC block with that book's
  // source/pageNumber metadata (e.g. Goblin Boss's A5e row shipping the XMM block
  // "on" A5e page 250). Computed once, order-independently — defer if ANY row for
  // the name is third-party — so a duplicate WotC+third-party name pair can't
  // flip the decision on iteration order. Honored by BOTH passes below (the
  // cross-source bulk match in pass 2 would otherwise re-attach the very WotC
  // block whenever CR + type agree). The Open5e pass fills these from their own
  // book, and main() asserts none stays thin, so a deferral neither source can
  // satisfy still fails loud rather than silently shipping thin.
  const canonicalNames = new Set(
    CANONICAL_RICH_NAMES.map((n) => n.toLowerCase()),
  );
  const deferToOpen5e = new Set<string>();
  for (const e of thin) {
    const key = e.name.toLowerCase();
    if (canonicalNames.has(key) && canonicalPrefersOpen5e(e.source)) {
      deferToOpen5e.add(key);
    }
  }

  // 1) The curated flagship subset. Hand-picked, so a miss is a hard error —
  // it means the name changed upstream and CANONICAL_RICH_NAMES needs a fix.
  const missing: string[] = [];
  for (const name of CANONICAL_RICH_NAMES) {
    if (deferToOpen5e.has(name.toLowerCase())) {
      console.log(
        `  ⊘ ${name}: CSV row sourced from a third-party (Open5e) book — deferring to the Open5e own-book block`,
      );
      continue;
    }
    const candidates = index.get(name.toLowerCase());
    if (!candidates?.length) {
      missing.push(name);
      console.warn(`  ✗ ${name}: no match in 5etools`);
      continue;
    }
    const picked = pickMonster(candidates);
    console.log(`  ✓ ${name}  ← ${picked._file} (${picked.source})`);
    rich.set(name.toLowerCase(), transformRich(picked));
  }

  if (missing.length > 0) {
    console.error(`\nERROR: ${missing.length} monsters had no 5etools match:`);
    for (const m of missing) console.error(`  - ${m}`);
    process.exit(1);
  }

  // 2) Best-effort bulk match: every other thin CSV row whose name (or a
  // close variant) exists in the official 5etools data also gets a full stat
  // block. A miss here is expected and silent — most of the CSV is
  // third-party content (Tome of Beasts, Creature Codex, A5e Monstrous
  // Menagerie) that 5etools-src, an official-WotC-content mirror, doesn't
  // carry at all. Two match shapes are gated on CR + base-type agreement with
  // the CSV row (and logged for review), so a different creature's block can't
  // silently overwrite curated stats:
  //   - LOSSY name matches (slash-split / parenthetical-stripped);
  //   - CROSS-SOURCE matches — the CSV row's source is one of the Open5e
  //     third-party books, so even an EXACT name hit in 5etools is a name
  //     collision with a *different* official creature, not this row's
  //     creature (e.g. Tome of Beasts and the MM both have creatures of the
  //     same name). A skipped row stays thin here and the Open5e pass below
  //     fills it from its own source book instead.
  let bulkMatched = 0;
  let gatedSkipped = 0;
  for (const entry of thin) {
    const key = entry.name.toLowerCase();
    if (rich.has(key)) continue;
    // Honor the canonical deferral: a canonical whose CSV row is third-party must
    // get its Open5e own-book block, not the same-name WotC block this pass would
    // attach whenever CR + base type happen to agree (which is exactly the common
    // case for a genuine same-name reprint).
    if (deferToOpen5e.has(key)) continue;
    const resolved = resolveFiveToolsKey(entry.name, index);
    if (!resolved) continue;
    const candidates = index.get(resolved.key)!;
    const picked = pickMonster(candidates as Array<FiveToolsMonster & { _file: string }>);
    const fields = transformRich(picked);
    const crossSource = OPEN5E_SLUG_BY_CSV_SOURCE[entry.source] !== undefined;
    if (resolved.lossy || crossSource) {
      const how = [resolved.lossy ? "lossy name" : null, crossSource ? "cross-source" : null]
        .filter(Boolean)
        .join(" + ");
      if (!richMatchesCsv(entry, fields)) {
        console.warn(
          `  ⚠ ${how} match skipped: "${entry.name}" (${entry.source}) → "${picked.name}" (${picked._file}) — CR ${entry.cr}/${entry.type} vs ${fields.cr}/${fields.type}; entry stays thin`,
        );
        gatedSkipped++;
        continue;
      }
      console.log(
        `  ~ ${how} match accepted (CR+type agree): "${entry.name}" (${entry.source}) → "${picked.name}" (${picked._file})`,
      );
    }
    rich.set(key, fields);
    bulkMatched++;
  }
  console.log(`  bulk-matched ${bulkMatched} additional thin entries against official 5etools data`);
  if (gatedSkipped > 0) console.log(`  ${gatedSkipped} lossy/cross-source matches skipped on CR disagreement (stay thin)`);

  return rich;
}

// ── Open5e (Kobold Press / Level Up A5e third-party content) ────────────────
// Open5e ships its monster data as Django fixtures: an array of
// `{ model, pk, fields }` records, one per source book, with several fields
// JSON-encoded as strings (suffixed `_json`) rather than nested natively.

interface Open5eFields {
  name: string;
  size?: string;
  type?: string;
  subtype?: string;
  alignment?: string;
  armor_class?: number;
  armor_desc?: string;
  hit_points?: number;
  hit_dice?: string;
  speed_json?: string;
  strength?: number;
  dexterity?: number;
  constitution?: number;
  intelligence?: number;
  wisdom?: number;
  charisma?: number;
  strength_save?: number | null;
  dexterity_save?: number | null;
  constitution_save?: number | null;
  intelligence_save?: number | null;
  wisdom_save?: number | null;
  charisma_save?: number | null;
  skills_json?: string;
  damage_vulnerabilities?: string;
  damage_resistances?: string;
  damage_immunities?: string;
  condition_immunities?: string;
  senses?: string;
  languages?: string;
  challenge_rating?: string;
  special_abilities_json?: string;
  actions_json?: string;
  bonus_actions_json?: string;
  reactions_json?: string;
  legendary_actions_json?: string;
}

function parseJsonField<T>(raw: string | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function indexOpen5e(): Map<string, Array<{ slug: Open5eSlug; fields: Open5eFields }>> {
  const index = new Map<string, Array<{ slug: Open5eSlug; fields: Open5eFields }>>();
  for (const slug of OPEN5E_SLUGS) {
    const file = path.join(OPEN5E_DATA_DIR, slug, "Monster.json");
    const records = readJSON<Array<{ fields: Open5eFields }>>(file);
    for (const r of records) {
      const key = r.fields.name.toLowerCase();
      const arr = index.get(key) ?? [];
      arr.push({ slug, fields: r.fields });
      index.set(key, arr);
    }
  }
  return index;
}

function formatOpen5eHP(fields: Open5eFields): string {
  const hp = fields.hit_points ?? 0;
  const dice = fields.hit_dice?.trim();
  if (!dice) return String(hp);
  // "18d10+36" → "18d10 + 36" to match the 5etools-sourced entries' style.
  return `${hp} (${dice.replace(/\s*([+-])\s*/g, " $1 ").trim()})`;
}

function formatOpen5eSpeed(raw: string | undefined): string {
  const speed = parseJsonField<Record<string, number | boolean | undefined>>(raw, {});
  const segments: string[] = [];
  for (const key of ["walk", "burrow", "climb", "fly", "swim"] as const) {
    const v = speed[key];
    if (typeof v !== "number") continue;
    segments.push(key === "walk" ? `${v} ft.` : `${key} ${v} ft.`);
  }
  if (speed["hover"] === true) segments.push("hover");
  return segments.join(", ") || "0 ft.";
}

function formatOpen5eSaves(fields: Open5eFields): string | undefined {
  const map: Record<(typeof ABILITY_KEYS)[number], number | null | undefined> = {
    str: fields.strength_save,
    dex: fields.dexterity_save,
    con: fields.constitution_save,
    int: fields.intelligence_save,
    wis: fields.wisdom_save,
    cha: fields.charisma_save,
  };
  const parts: string[] = [];
  for (const key of ABILITY_KEYS) {
    const v = map[key];
    if (v == null) continue;
    parts.push(`${ABILITY_LABEL[key]} ${v >= 0 ? "+" : ""}${v}`);
  }
  return parts.length > 0 ? parts.join(", ") : undefined;
}

function formatOpen5eSkills(raw: string | undefined): string | undefined {
  const skills = parseJsonField<Record<string, number>>(raw, {});
  const parts: string[] = [];
  for (const [name, bonus] of Object.entries(skills)) {
    const label = SKILL_NAMES[name.toLowerCase()] ?? name;
    parts.push(`${label} ${bonus >= 0 ? "+" : ""}${bonus}`);
  }
  return parts.length > 0 ? parts.join(", ") : undefined;
}

// Open5e strings carry HTML entities / BBCode / markdown the 5etools blocks
// don't; sanitize (and trim-to-undefined) so they read like the rest.
function nonEmpty(s: string | undefined): string | undefined {
  const cleaned = cleanOpen5e(s ?? "");
  return cleaned ? cleaned : undefined;
}

function open5eTraits(raw: string | undefined): MonsterTrait[] {
  const arr = parseJsonField<Array<{ name?: string; desc?: string }>>(raw, []);
  return arr
    .filter((t) => t.name)
    .map((t) => ({ name: cleanOpen5e(t.name!), desc: cleanOpen5e(t.desc ?? "") }));
}

function transformOpen5e(fields: Open5eFields): RichFields {
  const type = cleanOpen5e(fields.type ?? "unknown") || "unknown";
  const subtype = nonEmpty(fields.subtype);
  const actions = open5eTraits(fields.actions_json);
  // Open5e models bonus actions as their own list; our schema doesn't have a
  // separate bucket for them (no widget UI for a 5th tab), so fold them into
  // Actions with a name suffix rather than dropping them.
  const bonusActions = open5eTraits(fields.bonus_actions_json).map((t) => ({
    name: `${t.name} (Bonus Action)`,
    desc: t.desc,
  }));

  const out: RichFields = {
    ac: fields.armor_class ?? 10,
    acType: cleanOpen5e(fields.armor_desc ?? ""),
    hp: formatOpen5eHP(fields),
    size: fields.size ?? "Medium",
    type: subtype ? `${type} (${subtype})` : type,
    alignment: cleanOpen5e(fields.alignment ?? "unaligned") || "unaligned",
    cr: fields.challenge_rating ?? "0",
    speed: formatOpen5eSpeed(fields.speed_json),
    str: fields.strength ?? 10,
    dex: fields.dexterity ?? 10,
    con: fields.constitution ?? 10,
    int: fields.intelligence ?? 10,
    wis: fields.wisdom ?? 10,
    cha: fields.charisma ?? 10,
    senses: nonEmpty(fields.senses) ?? "—",
    languages: nonEmpty(fields.languages) ?? "—",
    actions: [...actions, ...bonusActions],
  };
  const saves = formatOpen5eSaves(fields);
  if (saves) out.savingThrows = saves;
  const skills = formatOpen5eSkills(fields.skills_json);
  if (skills) out.skills = skills;
  const immune = nonEmpty(fields.damage_immunities);
  if (immune) out.damageImmunities = immune;
  const resist = nonEmpty(fields.damage_resistances);
  if (resist) out.damageResistances = resist;
  const vuln = nonEmpty(fields.damage_vulnerabilities);
  if (vuln) out.damageVulnerabilities = vuln;
  const condImmune = nonEmpty(fields.condition_immunities);
  if (condImmune) out.conditionImmunities = condImmune;
  const traits = open5eTraits(fields.special_abilities_json);
  if (traits.length > 0) out.traits = traits;
  const reactions = open5eTraits(fields.reactions_json);
  if (reactions.length > 0) out.reactions = reactions;
  const legendary = open5eTraits(fields.legendary_actions_json);
  if (legendary.length > 0) out.legendaryActions = legendary;
  return out;
}

// Best-effort fill for CSV rows loadRichByName's 5etools pass left thin:
// match against the CSV row's own source book first, then fall back across
// the other four Open5e books. Mutates `rich` in place (shared with the
// 5etools pass) so main()'s single merge loop sees both sources uniformly.
// Lossy-name matches AND cross-book fallbacks (the CSV row's own book had no
// candidate, so we'd take another book's — possibly another ruleset's —
// version) are logged and gated on CR + base-type agreement with the CSV row.
function loadOpen5eRichByName(
  thin: Array<{ name: string; source: string; cr: string; type: string }>,
  rich: Map<string, RichFields>,
): void {
  console.log(`Indexing Open5e third-party bestiary at ${OPEN5E_DATA_DIR}/`);
  const index = indexOpen5e();
  console.log(`  ${index.size} unique monster names across all Open5e books`);

  let matched = 0;
  let gatedSkipped = 0;
  for (const entry of thin) {
    const key = entry.name.toLowerCase();
    if (rich.has(key)) continue;

    const ownSlug = OPEN5E_SLUG_BY_CSV_SOURCE[entry.source];
    const resolved = resolveFiveToolsKey(entry.name, index);
    if (!resolved) continue;
    const candidates = index.get(resolved.key)!;
    const ownPick = ownSlug ? candidates.find((c) => c.slug === ownSlug) : undefined;
    const crossBook = !ownPick;
    // Resolve the candidate together with its transformed fields so the chosen
    // candidate is transformed exactly once. For a cross-book fallback (the CSV
    // row's own book had no candidate), pick the candidate that actually matches
    // the curated creature — the first whose CR + base type agree — instead of
    // blindly taking candidates[0] and gating only that one, which would discard
    // a valid same-CR block later in the list.
    const resolvePick = () => {
      if (ownPick) return { picked: ownPick, fields: transformOpen5e(ownPick.fields) };
      for (const c of candidates) {
        const fields = transformOpen5e(c.fields);
        if (richMatchesCsv(entry, fields)) return { picked: c, fields };
      }
      const picked = candidates[0]!;
      return { picked, fields: transformOpen5e(picked.fields) };
    };
    const { picked, fields } = resolvePick();
    if (resolved.lossy || crossBook) {
      const how = [resolved.lossy ? "lossy name" : null, crossBook ? "cross-book" : null]
        .filter(Boolean)
        .join(" + ");
      if (!richMatchesCsv(entry, fields)) {
        console.warn(
          `  ⚠ ${how} match skipped: "${entry.name}" (${entry.source}) → "${picked.fields.name}" (${picked.slug}) — CR ${entry.cr}/${entry.type} vs ${fields.cr}/${fields.type}; entry stays thin`,
        );
        gatedSkipped++;
        continue;
      }
      console.log(
        `  ~ ${how} match accepted (CR+type agree): "${entry.name}" (${entry.source}) → "${picked.fields.name}" (${picked.slug})`,
      );
    }
    rich.set(key, fields);
    matched++;
  }
  console.log(`  matched ${matched} additional thin entries against Open5e third-party data`);
  if (gatedSkipped > 0) console.log(`  ${gatedSkipped} lossy/cross-book matches skipped on CR disagreement (stay thin)`);
}

// Thin fields only, straight from a CSV row (or defaulted, for acType which
// the CSV doesn't carry).
type ThinFields = Pick<
  MonsterEntry,
  | "name"
  | "ac"
  | "acType"
  | "hp"
  | "cr"
  | "size"
  | "type"
  | "alignment"
  | "source"
  | "environment"
  | "pageNumber"
  | "isLegendary"
  | "initiativeModifier"
  | "initiativeRoll"
>;

function loadThinEntries(): ThinFields[] {
  const csvPath = path.join(
    REPO_ROOT,
    "attached_assets/Monsters_&_Beasts_6f2f1d558fe144f8a49d17886a893051_all_1776621271153.csv",
  );
  console.log(`Reading ${path.relative(REPO_ROOT, csvPath)}`);

  const raw = fs.readFileSync(csvPath, "utf-8").replace(/^﻿/, "");
  const rows = parseCSV(raw);
  const header = rows[0]!;
  // Fail loud if any required column is absent rather than letting idx() return
  // -1 and every field's `|| 0` / `?? ""` default zero the whole dataset on a
  // clean exit (e.g. a re-export that renames "AC" to "Armor Class").
  const col = requireColumns(header, [
    "Name", "AC", "Alignment", "CR", "Hit Points", "Size", "Source", "Type",
    "Legendary", "Page Number", "Initiative", "Initiative Roll", "Environment",
  ]);

  const iName = col["Name"]!;
  const iAC = col["AC"]!;
  const iAlign = col["Alignment"]!;
  const iCR = col["CR"]!;
  const iHP = col["Hit Points"]!;
  const iSize = col["Size"]!;
  const iSource = col["Source"]!;
  const iType = col["Type"]!;
  const iLegendary = col["Legendary"]!;
  const iPage = col["Page Number"]!;
  const iInit = col["Initiative"]!;
  const iInitRoll = col["Initiative Roll"]!;
  const iEnv = col["Environment"]!;

  console.log(`  ${rows.length - 1} data rows`);

  const entries: ThinFields[] = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r]!;
    const name = row[iName]?.trim();
    if (!name) continue;
    entries.push({
      name,
      ac: parseInt(row[iAC] ?? "0", 10) || 0,
      acType: "",
      hp: row[iHP]?.trim() || "0",
      cr: row[iCR]?.trim() || "0",
      size: row[iSize]?.trim() ?? "",
      type: row[iType]?.trim() ?? "",
      alignment: row[iAlign]?.trim() ?? "",
      source: row[iSource]?.trim() ?? "",
      environment: row[iEnv]?.trim() ?? "",
      pageNumber: parseInt(row[iPage] ?? "", 10) || null,
      isLegendary: (row[iLegendary] ?? "").trim().toLowerCase() === "legendary",
      initiativeModifier: parseInt(row[iInit] ?? "0", 10) || 0,
      initiativeRoll: parseInt(row[iInitRoll] ?? "10", 10) || 10,
    });
  }

  // Dedup by case-insensitive name; first occurrence wins.
  const seen = new Set<string>();
  const unique = entries.filter((e) => {
    const key = e.name.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  console.log(`  ${unique.length} unique entries after dedup`);
  return unique;
}

function main() {
  const thin = loadThinEntries();
  const richByName = loadRichByName(thin);
  loadOpen5eRichByName(thin, richByName);

  // Every canonical flagship must end up rich, from whichever source. A
  // cross-source canonical deferred by loadRichByName (its CSV row is a
  // third-party book) is expected to be filled by the Open5e pass from its own
  // book; if neither pass supplied it, fail loud here instead of crashing in
  // the append loop below or silently shipping a thin flagship.
  const stillThin = CANONICAL_RICH_NAMES.filter(
    (n) => !richByName.has(n.toLowerCase()),
  );
  if (stillThin.length > 0) {
    console.error(
      `\nERROR: ${stillThin.length} canonical monster(s) never got a rich stat block:`,
    );
    for (const n of stillThin) console.error(`  - ${n}`);
    process.exit(1);
  }

  const merged: MonsterEntry[] = [];
  const usedRich = new Set<string>();

  for (const entry of thin) {
    const key = entry.name.toLowerCase();
    const rich = richByName.get(key);
    if (!rich) {
      merged.push(entry as MonsterEntry);
      continue;
    }
    usedRich.add(key);
    // Rich stat block wins on ac/hp/cr/size/type/alignment (it's derived
    // straight from the matching rules text); thin fields the rich source
    // doesn't carry (source/environment/pageNumber/initiativeRoll) pass
    // through from the CSV. initiativeModifier is recomputed from the rich
    // dex score to stay consistent with it.
    merged.push({
      ...entry,
      ...rich,
      initiativeModifier: Math.floor((rich.dex - 10) / 2),
      isLegendary: (rich.legendaryActions?.length ?? 0) > 0 || entry.isLegendary,
    });
  }

  // Canonical rich monsters the CSV doesn't carry at all (e.g. Beholder,
  // Mind Flayer) — append as new thin+rich entries.
  for (const name of CANONICAL_RICH_NAMES) {
    const key = name.toLowerCase();
    if (usedRich.has(key)) continue;
    const rich = richByName.get(key)!;
    merged.push({
      name,
      source: "5etools",
      environment: "",
      pageNumber: null,
      initiativeRoll: 10,
      initiativeModifier: Math.floor((rich.dex - 10) / 2),
      isLegendary: (rich.legendaryActions?.length ?? 0) > 0,
      ...rich,
    });
  }

  merged.sort((a, b) => a.name.localeCompare(b.name));

  const header = generatedHeader({
    source:
      "attached_assets/Monsters_&_Beasts_*.csv (curated by the project owner) + ../5etools-src/data/bestiary/bestiary-*.json + ../open5e-api/data/v1/{tob,cc,tob2,tob3,menagerie}/Monster.json (OGL — see OGL-NOTICE.md)",
    generator: "generate-monsters.ts",
    count: merged.length,
    pins: ["open5e-api @ v1.12.0"],
    licenses: [
      "Open5e (Kobold Press / EN Publishing) content is Open Game Content",
      "under the Open Gaming License v1.0a — see OGL-NOTICE.md.",
    ],
  });

  const body = `
export interface MonsterTrait {
  name: string;
  desc: string;
}

// Thin fields are always present. Rich fields (speed, ability scores,
// senses/languages, traits/actions/reactions/legendaryActions, ...) are only
// present for the curated subset with a full stat block — check \`actions\`
// to tell them apart from thin-only entries.
export interface MonsterEntry {
  name: string;
  ac: number;
  acType: string;
  hp: string;
  cr: string;
  size: string;
  type: string;
  alignment: string;
  source: string;
  environment: string;
  pageNumber: number | null;
  isLegendary: boolean;
  initiativeModifier: number;
  initiativeRoll: number;
  speed?: string;
  str?: number;
  dex?: number;
  con?: number;
  int?: number;
  wis?: number;
  cha?: number;
  savingThrows?: string;
  skills?: string;
  damageImmunities?: string;
  damageResistances?: string;
  damageVulnerabilities?: string;
  conditionImmunities?: string;
  senses?: string;
  languages?: string;
  traits?: MonsterTrait[];
  actions?: MonsterTrait[];
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

export const monsters: MonsterEntry[] = ${tsLiteral(merged)};
`;

  writeOutput(path.join(DM_DATA_DIR, "monsters.ts"), header + body);
}

main();
