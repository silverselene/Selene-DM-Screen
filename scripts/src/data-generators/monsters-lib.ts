// Pure, side-effect-free helpers for generate-monsters.ts, extracted so they
// can be unit-tested (generate-monsters.ts runs main() at import time and reads
// the sibling source clones, so nothing in it can be imported by a test — same
// reason dedupe.ts exists for the compendium generator).

// ── CSV parsing ────────────────────────────────────────────────────────────

export function parseCSV(content: string): string[][] {
  // Minimal RFC4180-ish parser; tolerates quoted fields containing commas
  // and escaped double quotes ("").
  const rows: string[][] = [];
  let cur = "";
  let inQuotes = false;
  let row: string[] = [];
  for (let i = 0; i < content.length; i++) {
    const ch = content[i];
    if (inQuotes) {
      if (ch === '"') {
        if (content[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        row.push(cur);
        cur = "";
      } else if (ch === "\r") {
        // ignore
      } else if (ch === "\n") {
        row.push(cur);
        cur = "";
        if (row.some((c) => c.length > 0)) rows.push(row);
        row = [];
      } else {
        cur += ch;
      }
    }
  }
  if (cur.length || row.length) {
    row.push(cur);
    if (row.some((c) => c.length > 0)) rows.push(row);
  }
  return rows;
}

// Resolve required CSV headers to their column indices, throwing if any are
// absent. A silently-missing column would make `header.indexOf(...)` return -1,
// `row[-1]` undefined, and every field's `|| 0` / `?? ""` default kick in — so
// a re-exported CSV with "AC" renamed to "Armor Class" would zero the whole
// dataset with a clean exit. Fail loud instead.
export function requireColumns(
  header: string[],
  names: string[],
): Record<string, number> {
  const out: Record<string, number> = {};
  const missing: string[] = [];
  for (const n of names) {
    const i = header.indexOf(n);
    if (i === -1) missing.push(n);
    else out[n] = i;
  }
  if (missing.length > 0) {
    throw new Error(
      `CSV is missing required column(s): ${missing.join(", ")}. ` +
        `Present headers: ${header.join(", ")}`,
    );
  }
  return out;
}

// ── Open5e text sanitizing ──────────────────────────────────────────────────

const HTML_ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&nbsp;": " ",
};

// Open5e strings are hand-authored markup, not clean prose: they carry HTML
// entities (`&amp;`), BBCode-style markers (`[++]…[/++]`), and markdown emphasis
// (`*At Will:*`) that the 5etools-sourced entries never have. Passing them
// through verbatim leaks raw markup mid-stat-block (e.g. the Phoenixborn
// Sorcerer's "[++], Senses, &amp; [/++][++]Languages[/++] …"). Decode + strip
// so an Open5e entry reads like a 5etools one.
export function cleanOpen5e(s: string): string {
  return s
    .replace(/&(?:amp|lt|gt|quot|apos|nbsp|#39);/g, (m) => HTML_ENTITIES[m] ?? m)
    // BBCode-ish markers: [++], [/++], [--] — bracketed runs of +/-/* punctuation.
    .replace(/\[\/?[+\-*]+\]/g, "")
    // HTML/BBCode formatting tags matched against a fixed allowlist, in opening,
    // closing, or self-closing form: [b], [/i], [em/], [br/]. An allowlist (not a
    // broad `[a-z]{1,8}`) is deliberate: the stat blocks DO carry legitimate
    // bracketed prose — "[Area of Effect]" alone appears 100+ times — that a
    // width-based rule would eat. The trailing-slash branch also catches the
    // self-closing `[em/]` / `[br/]` the old opening-slash-only pattern leaked.
    .replace(
      /\[\/?(?:b|i|u|s|em|strong|sub|sup|br|p|li|ul|ol|code|small|big)\/?\]/gi,
      "",
    )
    // Markdown emphasis asterisks, but only in emphasis position (adjacent to a
    // non-space) so a spaced literal "*" (e.g. multiplication "1 * 2") survives.
    .replace(/\*+(?=\S)|(?<=\S)\*+/g, "")
    // Tidy whitespace the strips introduced.
    .replace(/ {2,}/g, " ")
    .replace(/ +([,.;:])/g, "$1")
    // A stripped leading marker can strand punctuation at the start
    // ("[++], Senses …" → ", Senses …"); drop it.
    .replace(/^[\s,.;:]+/, "")
    .trim();
}

// ── Cross-source agreement gate ─────────────────────────────────────────────

// Numeric CR for agreement checks ("1/2" → 0.5). Null when unparseable — the
// empty/whitespace string included: Number("") is 0, which would otherwise
// masquerade as a real CR 0 and let a blank-CR row "agree" with a CR-0 block.
// Both paths route through the finiteness check so a malformed "n/0" resolves
// to null rather than Infinity, which would compare equal to another Infinity
// and read as agreement.
export function crValue(cr: string): number | null {
  const s = cr.trim();
  if (s === "") return null;
  const frac = s.match(/^(\d+)\s*\/\s*(\d+)$/);
  const n = frac ? Number(frac[1]) / Number(frac[2]) : Number(s);
  return Number.isFinite(n) ? n : null;
}

// Normalized base creature type for agreement checks: lowercase and drop any
// parenthetical subtype ("Dragon (metallic)" → "dragon", "beast" → "beast") so
// casing / subtype-formatting differences between the CSV and the rich source
// don't read as a mismatch. Empty or "unknown" → null ("don't know", not held
// against an otherwise-agreeing match).
export function baseType(type: string): string | null {
  const s = type.toLowerCase().replace(/\s*\(.*$/, "").trim();
  return s === "" || s === "unknown" ? null : s;
}

// Gate for lossy / cross-book matches: only attach the rich block when it's very
// likely the *same* creature. CR alone is a weak discriminator — many distinct
// creatures share a low CR — so require CR agreement AND, when both are known,
// base-type agreement. A same-name-after-stripping entry whose CR or type
// differs is almost certainly a different creature (or a different ruleset's
// version); overwriting the curated CSV's ac/hp/cr is worse than staying thin.
// Unparseable CRs count as disagreement (fail closed).
export function richMatchesCsv(
  csv: { cr: string; type: string },
  rich: { cr: string; type: string },
): boolean {
  const a = crValue(csv.cr);
  const b = crValue(rich.cr);
  if (a == null || b == null || a !== b) return false;
  const csvType = baseType(csv.type);
  const richType = baseType(rich.type);
  return csvType == null || richType == null || csvType === richType;
}

// ── Name resolution ─────────────────────────────────────────────────────────

// Try a name as-is, then a few common CSV-vs-5etools naming variants:
// trailing "(+)" (a CSV reprint marker), the segment before a "/" (combined
// entries like "Succubus/Incubus"), and a trailing parenthetical qualifier
// (e.g. "Giant Rat (Diseased)"). Returns the matching index key, or null.
// The "(+)" strip is faithful (pure reprint marker); the slash-split and
// generic parenthetical strip are LOSSY — the qualifier can be what makes it
// a different creature ("Vampire (Mist Form)") — so the result says which,
// letting callers gate lossy matches instead of silently attaching a
// different creature's stat block.
export function resolveFiveToolsKey(
  name: string,
  index: Map<string, unknown>,
): { key: string; lossy: boolean } | null {
  const faithful = [name];
  const noPlus = name.replace(/\s*\(\+\)\s*$/, "").trim();
  if (noPlus !== name) faithful.push(noPlus);
  const lossyTries: string[] = [];
  const beforeSlash = name.split("/")[0]!.trim();
  if (beforeSlash !== name) lossyTries.push(beforeSlash);
  const noParen = name.replace(/\s*\([^)]*\)\s*$/, "").trim();
  if (noParen !== name && !faithful.includes(noParen)) lossyTries.push(noParen);
  for (const t of faithful) {
    if (index.has(t.toLowerCase())) return { key: t.toLowerCase(), lossy: false };
  }
  for (const t of lossyTries) {
    if (index.has(t.toLowerCase())) return { key: t.toLowerCase(), lossy: true };
  }
  return null;
}

// ── Open5e source mapping ───────────────────────────────────────────────────

export const OPEN5E_SLUGS = ["tob", "cc", "tob2", "tob3", "menagerie"] as const;
export type Open5eSlug = (typeof OPEN5E_SLUGS)[number];

// CSV "Source" column value → Open5e document slug.
export const OPEN5E_SLUG_BY_CSV_SOURCE: Record<string, Open5eSlug> = {
  "Tome of Beasts": "tob",
  "Creature Codex": "cc",
  "Tome of Beasts 2": "tob2",
  "Tome of Beasts 3": "tob3",
  "A5e Monstrous Menagerie": "menagerie",
};

// A CANONICAL_RICH_NAMES monster whose CSV row is sourced from a third-party
// Open5e book should NOT get the ungated 5etools stat block attached: that mixes
// a WotC stat block with third-party source/pageNumber metadata (e.g. Goblin
// Boss's A5e row would ship the XMM block on page 250 of a different book). Defer
// to the Open5e pass so the block and its provenance come from the same source.
export function canonicalPrefersOpen5e(csvSource: string | undefined): boolean {
  return (
    csvSource != null &&
    Object.prototype.hasOwnProperty.call(OPEN5E_SLUG_BY_CSV_SOURCE, csvSource)
  );
}

// ── 5etools `spellcasting` blocks ───────────────────────────────────────────
//
// 5etools does NOT put a monster's spell list in `trait` or `action` — it lives
// in a dedicated `spellcasting` array with the groups held as structured keys
// (`will`, `daily: {"3e": [...]}`, `spells: {"1": {slots: 4, spells: [...]}}`).
// The generator originally read only trait/action/reaction/legendary, so every
// WotC caster shipped with no spells at all: the Lich, Mage, Archmage and the
// dragons all reached the app with a stat block whose Multiattack referred to
// "a use of Spellcasting" that was nowhere in the data. (The third-party Open5e
// books were unaffected — they embed spellcasting prose in `special_abilities`,
// which already flowed through `renderTraits`.)
//
// This renders the structured block back into the SAME prose shape the Open5e
// entries already use — a header sentence, then one "<Label>: <spells>" line per
// group — because that is the shape `src/lib/statblockCombat.ts` parses in the
// app, and the shape a DM reads when the parse misses. Emitting a bespoke
// structure here instead would mean two formats to parse for no gain.

export interface FiveToolsSpellcasting {
  name?: string;
  headerEntries?: unknown;
  footerEntries?: unknown;
  /** Cast at will, no limit. */
  will?: unknown;
  /** Always active. */
  constant?: unknown;
  /** Castable as a ritual only. */
  ritual?: unknown;
  /** Keyed by uses: "1" = 1/day, "1e" = 1/day EACH. Same for the rest/weekly forms. */
  daily?: Record<string, unknown>;
  rest?: Record<string, unknown>;
  weekly?: Record<string, unknown>;
  monthly?: Record<string, unknown>;
  yearly?: Record<string, unknown>;
  /** Keyed by spell level: "0" = cantrips. `slots` is the slot count. */
  spells?: Record<string, { slots?: number; lower?: number; spells?: unknown }>;
  /** Groups 5etools itself hides from the rendered list. */
  hidden?: string[];
  /** "action" on 2024 stat blocks, which moved Spellcasting out of traits. */
  displayAs?: string;
}

const ORDINALS = ["", "1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th"];

// The per-period group keys, in 5etools' own render order.
const PERIOD_GROUPS: { key: keyof FiveToolsSpellcasting; unit: string }[] = [
  { key: "rest", unit: "Rest" },
  { key: "daily", unit: "Day" },
  { key: "weekly", unit: "Week" },
  { key: "monthly", unit: "Month" },
  { key: "yearly", unit: "Year" },
];

/** "3e" → "3/Day Each", "1" → "1/Day". A trailing "e" is 5etools' marker for
 *  "that many uses of EACH spell listed" rather than shared uses. */
function periodLabel(rawKey: string, unit: string): string {
  const each = rawKey.endsWith("e");
  const n = each ? rawKey.slice(0, -1) : rawKey;
  return `${n}/${unit}${each ? " Each" : ""}`;
}

/** "0" → "Cantrips (at will)", "1" + 4 slots → "1st level (4 slots)". */
function levelLabel(rawLevel: string, slots: number | undefined): string {
  const level = Number(rawLevel);
  if (!Number.isInteger(level) || level < 0 || level > 9) return rawLevel;
  if (level === 0) return "Cantrips (at will)";
  if (slots === undefined || slots <= 0) return `${ORDINALS[level]} level`;
  return `${ORDINALS[level]} level (${slots} ${slots === 1 ? "slot" : "slots"})`;
}

/**
 * Render one `spellcasting` block to `{ name, desc, displayAs }`.
 *
 * `renderList` is injected rather than imported so this file stays free of
 * lib.ts's filesystem-touching module (it resolves the sibling clone paths at
 * import time). generate-monsters.ts passes `renderEntries`, which is what
 * turns `{@spell fire bolt|XPHB}` into "fire bolt".
 *
 * Returns null when the block carries no groups AND no header text — there is
 * nothing for the app to show, and an empty "Spellcasting" heading in a stat
 * block reads as a data bug.
 */
export function renderSpellcasting(
  block: FiveToolsSpellcasting,
  renderList: (entries: unknown) => string,
): { name: string; desc: string; displayAs: "action" | "trait" } | null {
  const hidden = new Set(block.hidden ?? []);
  const lines: string[] = [];

  const joinSpells = (entries: unknown): string =>
    renderList(entries).split("\n").map((s) => s.trim()).filter(Boolean).join(", ");

  const pushGroup = (label: string, entries: unknown): void => {
    const spells = joinSpells(entries);
    if (spells) lines.push(`${label}: ${spells}`);
  };

  if (block.constant && !hidden.has("constant")) pushGroup("Constant", block.constant);
  if (block.will && !hidden.has("will")) pushGroup("At Will", block.will);

  for (const { key, unit } of PERIOD_GROUPS) {
    if (hidden.has(key)) continue;
    const group = block[key] as Record<string, unknown> | undefined;
    if (!group || typeof group !== "object") continue;
    // Sort by use count so "1/Day" precedes "3/Day"; the JSON key order is
    // whatever the source file happened to use.
    for (const rawKey of Object.keys(group).sort(
      (a, b) => (parseInt(a, 10) || 0) - (parseInt(b, 10) || 0),
    )) {
      pushGroup(periodLabel(rawKey, unit), group[rawKey]);
    }
  }

  if (block.spells && !hidden.has("spells")) {
    for (const rawLevel of Object.keys(block.spells).sort(
      (a, b) => (parseInt(a, 10) || 0) - (parseInt(b, 10) || 0),
    )) {
      const slot = block.spells[rawLevel];
      if (!slot || typeof slot !== "object") continue;
      pushGroup(levelLabel(rawLevel, slot.slots), slot.spells);
    }
  }

  if (block.ritual && !hidden.has("ritual")) pushGroup("Rituals", block.ritual);

  const header = renderList(block.headerEntries);
  const footer = renderList(block.footerEntries);
  if (lines.length === 0 && !header) return null;

  return {
    // 5etools omits `name` on most blocks; the renderer's default is
    // "Spellcasting", and the app's parser keys spellcasting off that word.
    name: (block.name ?? "").trim() || "Spellcasting",
    desc: [header, lines.join("\n"), footer].filter(Boolean).join("\n\n"),
    displayAs: block.displayAs === "action" ? "action" : "trait",
  };
}
