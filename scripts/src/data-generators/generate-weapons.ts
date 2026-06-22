// Read 5etools items.json + items-base.json, filter to weapons, dedupe with
// the 2024 ("one") edition winning over classic, and emit
// artifacts/dm-screen/src/data/weapons.ts. Shape matches the WeaponInfo
// interface in PartyWidget.tsx (snake_case `damage_type`).

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

const PROP_NAMES: Record<string, string> = {
  A: "Ammunition",
  AF: "Automatic",
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
    props.push(PROP_NAMES[code] ?? code);
  }
  if (item.range) props.push(`Range ${item.range}`);
  if (item.reload != null) props.push(`Reload ${item.reload}`);
  if (item.dmg2) props.push(`Versatile ${item.dmg2}`);
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
    _edition: item.edition ?? "classic",
  };
}

function main() {
  console.log(`Reading 5etools weapons from ${FIVETOOLS_DATA_DIR}/items*.json`);
  const baseJson = readJSON<{ baseitem?: FiveToolsItem[] }>(
    path.join(FIVETOOLS_DATA_DIR, "items-base.json"),
  );
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

  // Stable id assignment by sort order so the file is deterministic.
  const unique = [...byName.values()].sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  const weapons: Weapon[] = unique.map((w, i) => {
    const { _edition, ...rest } = w;
    void _edition;
    return { id: i + 1, ...rest };
  });

  console.log(`\nUnique weapons: ${weapons.length}`);

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
}

export const weaponsData: Weapon[] = ${tsLiteral(weapons)};
`;

  writeOutput(path.join(DM_DATA_DIR, "weapons.ts"), header + body);
}

main();
