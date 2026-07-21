// Unified monster search over the single 2,160-row monsters dataset: a
// handful of entries carry a full stat block (Bestiary widget), the rest are
// thin autocomplete rows (Initiative widget). Both widgets share this helper
// so a name typed in either reaches the same dataset.

import { monsters, type MonsterEntry } from "@/data/monsters";

// A thin summary suitable for autocomplete lists (Initiative widget) and
// the result rows of Bestiary search. The full MonsterEntry (with its rich
// fields) is looked up by name when the user picks one.
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
  /** true when this entry carries a full stat block. */
  hasFullStatBlock: boolean;
}

function toHit(m: MonsterEntry): MonsterSearchHit {
  const hasFullStatBlock = m.actions !== undefined;
  return {
    id: hasFullStatBlock ? `bestiary:${m.name}` : `index:${m.name}:${m.source}`,
    name: m.name,
    size: m.size,
    type: m.type,
    ac: m.ac,
    acType: m.acType,
    hp: m.hp,
    cr: m.cr,
    source: m.source,
    isLegendary: m.isLegendary,
    initiativeModifier: m.initiativeModifier,
    hasFullStatBlock,
  };
}

const byLowerName = new Map<string, MonsterEntry>(
  monsters.map((m) => [m.name.toLowerCase(), m]),
);

/** Look up the full stat block for a name, or null if only thin data exists. */
export function findRichMonster(name: string): MonsterEntry | null {
  const m = byLowerName.get(name.toLowerCase());
  return m && m.actions !== undefined ? m : null;
}

const RESULT_LIMIT = 60;

// The empty-query "browse" list — full-stat-block monsters, alphabetized —
// depends on nothing but the bundled dataset, so compute it once at module
// load instead of re-filtering/mapping/sorting ~2,144 entries on every call
// (the Initiative search re-invokes searchMonsters('') each time the DM
// clears the box). Sorted BEFORE any slice so the caller's `limit` takes the
// alphabetically-first N, not the first N in dataset order re-sorted — the
// latter is correct only while generate-monsters.ts happens to emit
// pre-sorted, and would silently degrade to an arbitrary window if a regen
// changed emit order.
const browseHits: readonly MonsterSearchHit[] = monsters
  .filter((m) => m.actions !== undefined)
  .map(toHit)
  .sort((a, b) => a.name.localeCompare(b.name));

/**
 * Search {query} across the unified dataset. Returns up to {limit} hits
 * ordered by relevance (prefix > substring), with full-stat-block monsters
 * listed before thin ones at equal relevance.
 */
export function searchMonsters(
  query: string,
  limit: number = RESULT_LIMIT,
): MonsterSearchHit[] {
  const q = query.trim().toLowerCase();
  if (!q) {
    return browseHits.slice(0, limit);
  }

  // Score: 2 = prefix match, 1 = substring match, 0 = no match.
  const score = (name: string): number => {
    const n = name.toLowerCase();
    if (n.startsWith(q)) return 2;
    if (n.includes(q)) return 1;
    return 0;
  };

  return monsters
    .map((m) => ({ m, s: score(m.name) }))
    .filter((x) => x.s > 0)
    .map((x) => ({
      hit: toHit(x.m),
      score: x.s,
      rich: x.m.actions !== undefined ? 1 : 0,
    }))
    .sort((a, b) => {
      if (a.score !== b.score) return b.score - a.score;
      if (a.rich !== b.rich) return b.rich - a.rich;
      return a.hit.name.localeCompare(b.hit.name);
    })
    .slice(0, limit)
    .map((x) => x.hit);
}
