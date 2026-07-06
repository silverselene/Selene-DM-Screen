// Unified monster search: combines the rich 40-row bestiaryData (full stat
// blocks for the Bestiary widget) with the 2,158-row monsterIndex (thin
// autocomplete index for the Initiative widget). Both widgets share this
// helper so a name typed in either reaches the same dataset.

import { bestiaryData, type Monster } from "@/data/bestiary";
import { monsterIndex, type MonsterIndexEntry } from "@/data/monsterIndex";

// A thin summary suitable for autocomplete lists (Initiative widget) and
// the result rows of Bestiary search. Wider records (the full Monster
// from bestiaryData) are looked up by name when the user picks one.
export interface MonsterSearchHit {
  id: string;
  name: string;
  size: string;
  type: string;
  ac: number;
  acType: string;
  hp: string;
  cr: string;
  source: string;
  isLegendary: boolean;
  initiativeModifier: number;
  /** true when bestiaryData carries a full stat block for this name. */
  hasFullStatBlock: boolean;
}

function fromMonster(m: Monster): MonsterSearchHit {
  return {
    id: `bestiary:${m.name}`,
    name: m.name,
    size: m.size,
    type: m.type,
    ac: m.ac,
    acType: m.acType,
    hp: m.hp,
    cr: m.cr,
    source: "5etools",
    isLegendary: (m.legendaryActions?.length ?? 0) > 0,
    initiativeModifier: Math.floor((m.dex - 10) / 2),
    hasFullStatBlock: true,
  };
}

function fromIndex(m: MonsterIndexEntry): MonsterSearchHit {
  return {
    id: `index:${m.name}:${m.source}`,
    name: m.name,
    size: m.size,
    type: m.type,
    ac: m.ac,
    acType: "",
    hp: m.hp,
    cr: m.cr,
    source: m.source,
    isLegendary: m.isLegendary,
    initiativeModifier: m.initiativeModifier,
    hasFullStatBlock: false,
  };
}

const richByLowerName = new Map<string, Monster>(
  bestiaryData.map((m) => [m.name.toLowerCase(), m]),
);

/** Look up the full stat block for a name, or null if only thin data exists. */
export function findRichMonster(name: string): Monster | null {
  return richByLowerName.get(name.toLowerCase()) ?? null;
}

const RESULT_LIMIT = 60;

/**
 * Search both datasets for {query}. Returns up to {limit} hits ordered by
 * relevance (prefix > substring), with rich-stat-block monsters listed
 * before thin ones at equal relevance.
 */
export function searchMonsters(
  query: string,
  limit: number = RESULT_LIMIT,
): MonsterSearchHit[] {
  const q = query.trim().toLowerCase();
  if (!q) {
    return bestiaryData
      .slice(0, limit)
      .map(fromMonster)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  // Score: 2 = prefix match, 1 = substring match, 0 = no match.
  const score = (name: string): number => {
    const n = name.toLowerCase();
    if (n.startsWith(q)) return 2;
    if (n.includes(q)) return 1;
    return 0;
  };

  const rich = bestiaryData
    .map((m) => ({ m, s: score(m.name) }))
    .filter((x) => x.s > 0)
    .map((x) => ({ hit: fromMonster(x.m), score: x.s, rich: 1 }));

  const richNames = new Set(rich.map((r) => r.hit.name.toLowerCase()));

  const thin = monsterIndex
    .filter((m) => !richNames.has(m.name.toLowerCase()))
    .map((m) => ({ m, s: score(m.name) }))
    .filter((x) => x.s > 0)
    .map((x) => ({ hit: fromIndex(x.m), score: x.s, rich: 0 }));

  return [...rich, ...thin]
    .sort((a, b) => {
      if (a.score !== b.score) return b.score - a.score;
      if (a.rich !== b.rich) return b.rich - a.rich;
      return a.hit.name.localeCompare(b.hit.name);
    })
    .slice(0, limit)
    .map((x) => x.hit);
}
