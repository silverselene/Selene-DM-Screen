// Name-dedupe helpers for the compendium generator, extracted so they can be
// unit-tested (generate-compendium.ts runs main() at import time and reads the
// sibling source clones, so nothing in it can be imported by a test).

// Prefer 2024 core books, then 2014 core, then major expansions; anything
// else (adventure/setting-specific sourcebooks) falls back to first-found.
export const SOURCE_PRIORITY = ["XPHB", "XDMG", "PHB", "DMG", "TCE", "XGE", "MPMM"];

export function pickBestBySource<T extends { source?: string }>(items: T[]): T {
  let best = items[0]!;
  let bestRank = SOURCE_PRIORITY.indexOf(best.source ?? "");
  if (bestRank === -1) bestRank = SOURCE_PRIORITY.length;
  for (const it of items.slice(1)) {
    let rank = SOURCE_PRIORITY.indexOf(it.source ?? "");
    if (rank === -1) rank = SOURCE_PRIORITY.length;
    if (rank < bestRank) {
      best = it;
      bestRank = rank;
    }
  }
  return best;
}

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function dedupeByName<T extends { name: string; source?: string }>(items: T[]): T[] {
  const groups = new Map<string, T[]>();
  for (const it of items) {
    // Key on slugify(name), not name.toLowerCase(): ids are minted from the
    // slug, so any two names the slug collapses ("Fey Touched" / "Fey-Touched")
    // MUST dedupe here or they ship as separate entries with colliding ids.
    const key = slugify(it.name);
    const arr = groups.get(key) ?? [];
    arr.push(it);
    groups.set(key, arr);
  }
  return [...groups.values()].map(pickBestBySource);
}
