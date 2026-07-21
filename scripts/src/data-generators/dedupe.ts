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

export interface SlugCollision {
  slug: string;
  /** Distinct spellings that collapsed onto `slug`, in first-seen order. */
  names: string[];
  /** The `name` of the entry that won the source-priority tie-break. */
  kept: string;
}

// Cross-section dedup: return the entries whose `keyOf` is not in the running
// `seen` set yet, adding each survivor's key. Sections run through this in
// order, so the first section to emit a key wins (e.g. the 5etools feats pass'
// "Survivor" suppresses the Open5e pass' second "Survivor" — they have distinct
// ids/slugs so dedupeByName can't catch it). The caller owns the key shape:
// dedup is done on category+title, NOT title alone, so a genuinely distinct
// entry that merely shares a title across categories (an Action vs a Skill both
// named "Hide") is kept, not silently dropped. Mutates `seen`.
export function dropSeenTitles<T>(
  entries: T[],
  seen: Set<string>,
  keyOf: (entry: T) => string,
): T[] {
  const out: T[] = [];
  for (const e of entries) {
    const key = keyOf(e);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(e);
  }
  return out;
}

export function dedupeByName<T extends { name: string; source?: string }>(
  items: T[],
  // Called once per slug that collapsed two or more DISTINCT names — i.e. every
  // case where a real entry's content was dropped (only the winner survives).
  // Legitimate cross-book spelling variants land here too ("Fey Touched" /
  // "Fey-Touched"), so it's a review signal, not an error: the generator wires
  // this to a console.warn so a human regenerating can eyeball each merge and
  // catch a genuinely-wrong collapse (two different rules, one lost) instead of
  // it shipping silently.
  onCollision?: (collision: SlugCollision) => void,
): T[] {
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
  const out: T[] = [];
  for (const [slug, group] of groups) {
    const best = pickBestBySource(group);
    if (onCollision) {
      const names = [...new Set(group.map((g) => g.name))];
      if (names.length > 1) onCollision({ slug, names, kept: best.name });
    }
    out.push(best);
  }
  return out;
}
