// Read 5etools items.json + items-base.json, filter to weapons, dedupe with
// the 2024 ("one") edition winning over classic, and emit
// artifacts/dm-screen/src/data/weapons.ts. Shape matches the WeaponInfo
// interface in PartyWidget.tsx (snake_case `damage_type`).
//
// Also emits the rules text the Compendium's weapon cards explain:
//   - `weaponPropertyRules` — one definition per weapon property (Finesse,
//     Light, …), 2024 wording preferred, from items-base.json `itemProperty`.
//   - `weaponMasteryRules`  — the 2024 Weapon Mastery definitions (Nick,
//     Sap, …), from items-base.json `itemMastery`.
// Each weapon carries its `mastery` (2024 base weapons list it directly; a
// magic weapon inherits it from its `baseItem`) and `kind` (melee/ranged).

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

const DMG_TYPES: Record<string, string> = {
  A: "Acid",
  B: "Bludgeoning",
  C: "Cold",
  F: "Fire",
  O: "Force",
  L: "Lightning",
  N: "Necrotic",
  P: "Piercing",
  Po: "Poison",
  Py: "Psychic",
  R: "Radiant",
  S: "Slashing",
  T: "Thunder",
};

// Fallback labels for property codes, used only when items-base.json has no
// `itemProperty` definition naming the code. (`AF` is firearm ammunition, not
// "Automatic" — an earlier hand-written label; see propertyLabels() below.)
const PROP_NAMES: Record<string, string> = {
  A: "Ammunition",
  AF: "Ammunition (Firearm)",
  BF: "Burst Fire",
  F: "Finesse",
  H: "Heavy",
  L: "Light",
  LD: "Loading",
  R: "Reach",
  RLD: "Reload",
  S: "Special",
  T: "Thrown",
  "2H": "Two-Handed",
  V: "Versatile",
};

interface FiveToolsItem {
  name: string;
  edition?: string;
  source?: string;
  type?: string;
  baseItem?: string;
  mastery?: Array<string | { uid?: string }>;
  weapon?: boolean;
  weaponCategory?: string;
  dmg1?: string;
  dmg2?: string;
  dmgType?: string;
  weight?: number;
  value?: number;
  range?: string;
  reload?: number;
  property?: Array<string | { name?: string }>;
  entries?: unknown;
}

interface Weapon {
  id: number;
  name: string;
  category: string | null;
  damage: string | null;
  damage_type: string | null;
  weight: string | null;
  properties: string[];
  cost: string | null;
  description: string | null;
  is_homebrew: boolean;
  kind: "melee" | "ranged" | null;
  mastery: string[];
}

interface WeaponRule {
  name: string;
  description: string;
}

interface FiveToolsProperty {
  abbreviation: string;
  source?: string;
  name?: string;
  entries?: Array<{ name?: string; entries?: unknown }>;
}

interface FiveToolsMastery {
  name: string;
  source?: string;
  entries?: unknown;
}

// 2024 core books first, then 2014 core, then anything else (EGW's Vestige).
const RULE_SOURCE_RANK: Record<string, number> = { XPHB: 3, XDMG: 3, PHB: 2, DMG: 2 };
const ruleRank = (src?: string) => RULE_SOURCE_RANK[src ?? ""] ?? 1;

// Codes whose official entry name collides with another property's or is
// missing. `AF`'s definition is titled plain "Ammunition" (same as `A`).
const PROP_NAME_OVERRIDES: Record<string, string> = {
  AF: "Ammunition (Firearm)",
  S: "Special",
};

/** code → display label, from the best-ranked `itemProperty` definition. */
let propLabels: Record<string, string> = { ...PROP_NAMES };

function bestPropertyDefs(props: FiveToolsProperty[]): Map<string, FiveToolsProperty> {
  const best = new Map<string, FiveToolsProperty>();
  for (const p of props) {
    const cur = best.get(p.abbreviation);
    if (!cur || ruleRank(p.source) > ruleRank(cur.source)) best.set(p.abbreviation, p);
  }
  return best;
}

function propertyLabels(defs: Map<string, FiveToolsProperty>): Record<string, string> {
  const labels: Record<string, string> = { ...PROP_NAMES };
  for (const [code, def] of defs) {
    const name = PROP_NAME_OVERRIDES[code] ?? def.entries?.[0]?.name ?? def.name;
    if (name) labels[code] = stripTags(name);
  }
  return labels;
}

function propertyRules(defs: Map<string, FiveToolsProperty>, labels: Record<string, string>): WeaponRule[] {
  const rules: WeaponRule[] = [];
  for (const [code, def] of defs) {
    const description = renderEntries(def.entries?.[0]?.entries ?? def.entries);
    if (!description) continue; // e.g. PHB "special" has no text
    rules.push({ name: labels[code] ?? code, description });
  }
  return rules.sort((a, b) => a.name.localeCompare(b.name));
}

function masteryRules(masteries: FiveToolsMastery[]): WeaponRule[] {
  const best = new Map<string, FiveToolsMastery>();
  for (const m of masteries) {
    const cur = best.get(m.name);
    if (!cur || ruleRank(m.source) > ruleRank(cur.source)) best.set(m.name, m);
  }
  return [...best.values()]
    .map((m) => ({ name: m.name, description: renderEntries(m.entries) }))
    .filter((r) => r.description)
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** "Nick|XPHB" → "Nick". */
function parseMastery(item: FiveToolsItem): string[] {
  return (item.mastery ?? [])
    .map((m) => (typeof m === "string" ? m : (m?.uid ?? "")).split("|")[0] ?? "")
    .filter(Boolean);
}

/** "M|XPHB" → melee, "R" → ranged. */
function parseKind(item: FiveToolsItem): "melee" | "ranged" | null {
  const t = (item.type ?? "").split("|")[0];
  return t === "M" ? "melee" : t === "R" ? "ranged" : null;
}

function stripPropSource(p: string | { name?: string } | unknown): string {
  if (typeof p === "string") return p.split("|")[0] ?? "";
  return "";
}

function parseProperties(item: FiveToolsItem): string[] {
  const props: string[] = [];
  for (const p of item.property ?? []) {
    const code = stripPropSource(p);
    if (!code) continue;
    props.push(propLabels[code] ?? code);
  }
  if (item.range) props.push(`Range ${item.range}`);
  if (item.reload != null) props.push(`Reload ${item.reload}`);
  if (item.dmg2) {
    // The "V" property code already expanded to a bare "Versatile" above;
    // replace it with the dice-bearing form rather than listing both
    // "Versatile" and "Versatile 1d10".
    return [...new Set(props.filter(p => p !== "Versatile")), `Versatile ${item.dmg2}`];
  }
  return [...new Set(props)];
}

function parseCost(item: FiveToolsItem): string | null {
  if (item.value == null) return null;
  const cp = item.value;
  if (cp % 100 === 0) return `${cp / 100} gp`;
  if (cp % 10 === 0) return `${cp / 10} sp`;
  return `${cp} cp`;
}

function isWeapon(item: FiveToolsItem): boolean {
  return Boolean(item.weapon ?? item.weaponCategory ?? item.dmg1);
}

interface DraftWeapon extends Omit<Weapon, "id"> {
  _edition: string;
  _baseItem: string | null;
}

function parseItem(item: FiveToolsItem): DraftWeapon {
  const damage = item.dmg1 ?? null;
  const dmgType = item.dmgType
    ? (DMG_TYPES[item.dmgType] ?? item.dmgType)
    : null;
  const description = renderEntries(item.entries) || null;
  return {
    name: stripTags(item.name) || item.name,
    category: item.weaponCategory ?? null,
    damage,
    damage_type: dmgType,
    weight: item.weight != null ? `${item.weight} lb.` : null,
    properties: parseProperties(item),
    cost: parseCost(item),
    description,
    is_homebrew: false,
    kind: parseKind(item),
    mastery: parseMastery(item),
    _edition: item.edition ?? "classic",
    _baseItem: item.baseItem ? (item.baseItem.split("|")[0] ?? "").toLowerCase() || null : null,
  };
}

function main() {
  console.log(`Reading 5etools weapons from ${FIVETOOLS_DATA_DIR}/items*.json`);
  const baseJson = readJSON<{
    baseitem?: FiveToolsItem[];
    itemProperty?: FiveToolsProperty[];
    itemMastery?: FiveToolsMastery[];
  }>(path.join(FIVETOOLS_DATA_DIR, "items-base.json"));

  // Property labels must be resolved before any item is parsed.
  const propDefs = bestPropertyDefs(baseJson.itemProperty ?? []);
  propLabels = propertyLabels(propDefs);
  const propRules = propertyRules(propDefs, propLabels);
  const masteryRuleList = masteryRules(baseJson.itemMastery ?? []);
  const itemsJson = readJSON<{ item?: FiveToolsItem[] }>(
    path.join(FIVETOOLS_DATA_DIR, "items.json"),
  );

  const baseWeapons = (baseJson.baseitem ?? []).filter(isWeapon).map(parseItem);
  const extraWeapons = (itemsJson.item ?? []).filter(isWeapon).map(parseItem);

  console.log(`  Base weapons:           ${baseWeapons.length}`);
  console.log(`  Magic / extra weapons:  ${extraWeapons.length}`);

  // Dedup by lowercased name. 2024 ("one") edition wins ties.
  const editionRank = (e: string) => (e === "one" ? 2 : 1);
  const byName = new Map<string, DraftWeapon>();
  for (const w of [...baseWeapons, ...extraWeapons]) {
    const key = w.name.toLowerCase();
    const existing = byName.get(key);
    if (!existing || editionRank(w._edition) > editionRank(existing._edition)) {
      byName.set(key, w);
    }
  }

  // A magic weapon ("Dagger of Venom", "+1 Longsword") has no mastery or
  // melee/ranged type of its own — it inherits both from its base weapon.
  // byName already holds the 2024 base entry where one exists.
  let inherited = 0;
  for (const w of byName.values()) {
    if (!w._baseItem) continue;
    const base = byName.get(w._baseItem);
    if (!base) continue;
    if (w.mastery.length === 0 && base.mastery.length > 0) {
      w.mastery = [...base.mastery];
      inherited++;
    }
    if (w.kind == null) w.kind = base.kind;
  }

  // Stable id assignment by sort order so the file is deterministic.
  const unique = [...byName.values()].sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  const weapons: Weapon[] = unique.map((w, i) => {
    const { _edition, _baseItem, ...rest } = w;
    void _edition;
    void _baseItem;
    return { id: i + 1, ...rest };
  });

  console.log(`\nUnique weapons: ${weapons.length}`);
  console.log(`  With a mastery:         ${weapons.filter((w) => w.mastery.length > 0).length} (${inherited} inherited from a base weapon)`);
  console.log(`  Property rules:         ${propRules.length}`);
  console.log(`  Mastery rules:          ${masteryRuleList.length}`);

  const header = generatedHeader({
    source: "../5etools-src/data/items.json + items-base.json",
    generator: "generate-weapons.ts",
    count: weapons.length,
  });

  const body = `
export interface Weapon {
  id: number;
  name: string;
  category: string | null;
  damage: string | null;
  damage_type: string | null;
  weight: string | null;
  properties: string[];
  cost: string | null;
  description: string | null;
  is_homebrew: boolean;
  /** Melee or ranged weapon (5etools \`type\`); null when the source omits it. */
  kind: "melee" | "ranged" | null;
  /** 2024 Weapon Mastery property names, e.g. ["Nick"]. Empty for weapons
   *  with none (2014-only / third-party weapons). */
  mastery: string[];
}

/** Official rules text for a weapon property or a Weapon Mastery. */
export interface WeaponRule {
  name: string;
  description: string;
}

export const weaponsData: Weapon[] = ${tsLiteral(weapons)};

/** Weapon property definitions (Finesse, Light, …), 2024 wording preferred. */
export const weaponPropertyRules: WeaponRule[] = ${tsLiteral(propRules)};

/** 2024 Weapon Mastery definitions (Cleave, Graze, Nick, …). */
export const weaponMasteryRules: WeaponRule[] = ${tsLiteral(masteryRuleList)};
`;

  writeOutput(path.join(DM_DATA_DIR, "weapons.ts"), header + body);
}

main();
