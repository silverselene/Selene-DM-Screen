import type { BridgeEvent } from "@workspace/bridge-protocol";

/** The `tool_result` variant, produced by every parser here. */
type ToolResultEvent = Extract<BridgeEvent, { type: "tool_result" }>;

/**
 * Flatten an SDK `tool_result` block's `content` into a single string. The SDK
 * delivers it as either a plain string or an array of content parts; we keep
 * only the text parts (ddb-mcp returns text), joined by newlines. Anything
 * unexpected degrades to "".
 */
export function extractToolResultText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter(
        (p): p is { type: "text"; text: string } =>
          typeof p === "object" && p !== null &&
          (p as { type?: unknown }).type === "text" &&
          typeof (p as { text?: unknown }).text === "string",
      )
      .map((p) => p.text)
      .join("\n");
  }
  return "";
}

/**
 * ddb-mcp (≥3.0) wraps text other people wrote (homebrew, character names,
 * notes, book text) in these delimiters, each on its own line, so the MODEL
 * treats it as data rather than instructions. They are addressed to the model,
 * not the DM: the model still receives the raw, wrapped tool result through the
 * SDK, while the card (DM-facing display + parsing input) drops the delimiter
 * lines so they neither render as literal tags nor get mistaken for content
 * (e.g. the character-name line the card title is read from).
 */
const UNTRUSTED_DELIMITER_LINE_RE = /^[ \t]*<\/?untrusted_dndbeyond_content>[ \t]*(?:\r?\n|$)/gm;

/** Remove ddb-mcp's untrusted-content delimiter lines. Exported for tests. */
export function stripUntrustedDelimiters(text: string): string {
  return text.replace(UNTRUSTED_DELIMITER_LINE_RE, "");
}

/**
 * ddb-mcp (≥3.0) labels names with their ruleset — `Sage [2014]`, `Web [2014]`,
 * `Dark Bargain [third-party]` — and heads each result with a `Rules: …` line.
 * Neither is part of the name the party roster stores (or the bundled datasets
 * match against), so both are stripped from extracted names/fields. The full
 * markdown keeps them: the DM still sees which edition a card came from.
 */
const EDITION_TAG_RE = /\s*\[(?:2014|2024|third-party|homebrew|playtest|edition not stated)\]/gi;

function stripEditionTags(name: string): string {
  return name.replace(EDITION_TAG_RE, "").trim();
}

/** The `Rules: 2024 · …` provenance line ddb-mcp (≥3.0) puts under a title. */
function isRulesLine(line: string): boolean {
  return /^Rules:\s/.test(line.trim());
}

/** First `# ` heading text, else "". */
function firstHeading(text: string): string {
  const heading = /^#\s+(.+)$/m.exec(text);
  return heading ? heading[1].trim() : "";
}

/**
 * First `# ` heading text, else the first non-empty line, else "". Used for
 * rich (monster/character) card titles, where the leading line is the creature
 * or character name even when the `#` heading is missing (format drift).
 */
function firstHeadingOrLine(text: string): string {
  const heading = firstHeading(text);
  if (heading) return heading;
  const line = text.split("\n").map((l) => l.trim()).find((l) => l.length > 0);
  return line ?? "";
}

/** Humanize a bare tool name: "ddb_get_rules" → "Get rules". */
function humanizeToolName(name: string): string {
  const bare = name.replace(/^ddb_/, "").replace(/_/g, " ").trim();
  return bare.charAt(0).toUpperCase() + bare.slice(1);
}

/** Add `key` to `fields` only if the regex matches (keeps fields best-effort). */
function addField(fields: Record<string, string>, key: string, re: RegExp, text: string): void {
  const m = re.exec(text);
  if (m && m[1].trim()) fields[key] = m[1].trim();
}

function parseMonsterCard(text: string): ToolResultEvent {
  const fields: Record<string, string> = {};
  // Subtitle (type/alignment) is the italic line immediately after the title,
  // e.g. `*Small humanoid, neutral evil*` under `# Goblin`. Anchor to that
  // position — the first non-empty line is the title, the next non-empty line
  // is the subtitle — rather than the first italic anywhere in the block, so an
  // italic trait/action name later on can't be mistaken for the creature's type.
  // ddb-mcp ≥3.0 inserts provenance lines between the two — `Rules: 2024 · …`
  // and, for a renamed creature, `(2014 name: Goblin · 2024 name: Goblin
  // Warrior)` — which are skipped rather than ending the search.
  const lines = text.split("\n").map((l) => l.trim());
  let seenTitle = false;
  for (const line of lines) {
    if (line === "") continue;
    if (!seenTitle) {
      seenTitle = true;
      continue;
    }
    if (isRulesLine(line) || /^\(\d{4} name: .*\)$/.test(line)) continue;
    const italic = /^\*([^*\n]+)\*$/.exec(line);
    if (italic && italic[1].trim()) fields.type = italic[1].trim();
    break; // only the first non-empty line after the title is the subtitle
  }
  addField(fields, "ac", /^\*\*Armor Class\*\*\s+(.+)$/m, text);
  addField(fields, "hp", /^\*\*Hit Points\*\*\s+(.+)$/m, text);
  addField(fields, "speed", /^\*\*Speed\*\*\s+(.+)$/m, text);
  addField(fields, "cr", /^\*\*Challenge\*\*\s+(.+)$/m, text);
  return {
    type: "tool_result",
    tool: "ddb_get_monster",
    kind: "monster",
    title: stripEditionTags(firstHeadingOrLine(text)),
    ...(Object.keys(fields).length ? { fields } : {}),
    markdown: text,
  };
}

function parseCharacterCard(text: string): ToolResultEvent {
  const fields: Record<string, string> = {};
  // Identity block: name line, then "Race | Class N | Level N".
  const idLine = /^\s*(.+?)\s*\|\s*(.+?)\s*\|\s*Level\s+(\d+)\s*$/m.exec(text);
  let title = "";
  if (idLine) {
    fields.race = stripEditionTags(idLine[1]);
    fields.class = stripEditionTags(idLine[2]);
    fields.level = idLine[3].trim();
    // Name is the non-empty line directly above the identity line (skip box
    // rules, and the `Rules: …` provenance line ddb-mcp ≥3.0 puts between them).
    const lines = text.split("\n");
    const idx = lines.findIndex((l) => /\|\s*Level\s+\d+\s*$/.test(l));
    for (let i = idx - 1; i >= 0; i--) {
      const t = lines[i].replace(/[═─—]+/g, "").trim();
      if (t && !isRulesLine(t)) {
        title = stripEditionTags(t);
        break;
      }
    }
  }
  addField(fields, "background", /^\s*Background:\s*([^\n|]+)/m, text);
  if (fields.background) {
    const background = stripEditionTags(fields.background);
    if (background) fields.background = background;
    else delete fields.background;
  }
  addField(fields, "hp", /^\s*HP:\s*(\d+\s*\/\s*\d+)/m, text);
  addField(fields, "ac", /^\s*AC:\s*(\d+)/m, text);
  addField(fields, "initiative", /Initiative:\s*([+\-]?\d+)/, text);
  addField(fields, "speed", /Speed:\s*([^\n]+?)\s*$/m, text);
  if (fields.hp) fields.hp = fields.hp.replace(/\s+/g, "");
  const spells = parseSheetSpells(text);
  // Exclude spell names so an attack cantrip listed in ACTIONS (e.g. Fire Bolt,
  // which carries a `to hit`) isn't also miscounted as a weapon.
  const weapons = parseSheetWeapons(text, spells);
  return {
    type: "tool_result",
    tool: "ddb_get_character",
    kind: "character",
    title: title || firstHeadingOrLine(text) || "Character",
    ...(Object.keys(fields).length ? { fields } : {}),
    ...(spells.length ? { spells } : {}),
    ...(weapons.length ? { weapons } : {}),
    markdown: text,
  };
}

/** Trim, drop empties, and de-duplicate names case-insensitively (first spelling
 *  wins, order preserved). Shared by the sheet spell/weapon extractors. */
function dedupeNames(names: Iterable<string>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of names) {
    const name = raw.trim();
    const key = name.toLowerCase();
    if (name && !seen.has(key)) {
      seen.add(key);
      out.push(name);
    }
  }
  return out;
}

/**
 * Body of an ALL-CAPS section header (e.g. "SPELLS", "ACTIONS"): the text from
 * just after that header line to the next ALL-CAPS header line (or EOF), or ""
 * when the header is absent. Scopes a parse to one section so a same-shaped line
 * elsewhere (e.g. a "From Race: Darkvision" trait line outside SPELLS) isn't
 * mis-read as belonging to it.
 */
function sectionBody(text: string, header: string): string {
  const start = new RegExp(`^${header}[ \\t]*$`, "m").exec(text);
  if (!start) return "";
  const after = text.slice(start.index + start[0].length);
  // Next section header: a column-0 line that opens with a capital and carries
  // no lowercase — matches real headers like "SPELL SLOTS", "FEATS (1)", and
  // "PROFICIENCIES & TRAINING", while indented content and "• …" bullets don't.
  const next = /^[A-Z][^a-z\n]*$/m.exec(after);
  return next ? after.slice(0, next.index) : after;
}

/**
 * Extract bare spell names from a `full`/`spells` character sheet's SPELLS
 * block. The block lists them as `  Cantrips: A, B`, `  Spells: C (L3), D (L1
 * [ritual])`, and `  From <source>: E` lines; we split on commas and drop the
 * trailing `(L#…)` level/ritual annotation so a name matches the party roster's
 * plain-string list. Scoped to the SPELLS section so a "From <source>:" line in
 * another block isn't slurped. De-duplicated, order preserved. Best-effort: a
 * summary-only sheet has no SPELLS block → `[]`.
 */
export function parseSheetSpells(text: string): string[] {
  const block = sectionBody(text, "SPELLS");
  const names: string[] = [];
  // ddb-mcp ≥3.0 moves homebrew spells onto their own `Cantrips (homebrew): …`
  // line (`From <source> (homebrew):` is already covered by `From [^:\n]+`),
  // and labels a name with its ruleset (`Web [2014] (L2)`) — stripped after
  // the level annotation so `Web` and `Web [2014]` de-dupe to one entry.
  const re = /^\s*(?:Cantrips|Spells|From [^:\n]+?)(?: \(homebrew\))?:\s*(.+)$/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(block)) !== null) {
    for (const raw of m[1].split(",")) {
      names.push(stripEditionTags(raw.replace(/\s*\(L\d+[^)]*\)\s*$/, "")));
    }
  }
  return dedupeNames(names);
}

/** An ACTIONS / BONUS ACTIONS row label that names a spell, not a weapon:
 *  ddb-mcp ≥3.0 lists attack spells as `Fire Bolt (cantrip)` / `Chromatic Orb
 *  (1st level)` under ACTIONS and bonus-action/reaction spells as `Hunter's
 *  Mark (spell, 1st-level slot)`. */
const SPELL_ROW_LABEL_RE = /\((?:cantrip|\d+(?:st|nd|rd|th) level|spell\b[^)]*)\)$/i;

/** Every character can make an Unarmed Strike; the Party widget already shows
 *  one on every character (display-only), so it isn't a roster weapon — the
 *  same as the D&D Beyond JSON import, which never stores it. */
const UNARMED_STRIKE = "unarmed strike";

/** A weapon attack row carries a reach or range figure after its damage (e.g.
 *  `reach 5 ft.`, `range 80/320 ft.`); used to tell an off-hand weapon row in
 *  BONUS ACTIONS from a bonus-action ability that also rolls to hit. */
const WEAPON_REACH_OR_RANGE_RE = /\b(?:reach|range)\s+\d/;

/**
 * Extract weapon names from a character sheet's combat rows. Each weapon
 * attack is a `• <name>   <+N> to hit   …` line (name padded to 16 chars, an
 * optional `×N` quantity prefix).
 *
 * Main-hand weapons are the ACTIONS rows. ddb-mcp ≥3.0 prints an off-hand
 * weapon (two-weapon fighting) under BONUS ACTIONS instead, so that section is
 * read too — but only weapon-shaped rows (a reach/range figure, no spell
 * label): any other `to hit` bullet there or under REACTIONS (e.g. Spiritual
 * Weapon) is an ability, not a weapons-roster entry.
 *
 * Dropped: spell rows (`exclude` = the sheet's spell names, plus anything
 * labelled `(cantrip)` / `(Nth level)` / `(spell, …)`) and Unarmed Strike
 * (see UNARMED_STRIKE). Ruleset tags (`Dragon Slayer Rapier [2014]`) are
 * stripped. De-duplicated, order preserved — an off-hand weapon of the same
 * kind as the main-hand one appears once. Best-effort: a summary-only sheet
 * has no ACTIONS block → `[]`.
 */
export function parseSheetWeapons(text: string, exclude: readonly string[] = []): string[] {
  const excluded = new Set(exclude.map((s) => s.toLowerCase()));
  excluded.add(UNARMED_STRIKE);
  const names: string[] = [];
  const re = /^\s*•\s*(?:×\d+\s+)?(.+?)\s+[+\-]?\d+\s+to hit\b.*$/gm;
  const collect = (block: string, weaponShapedOnly: boolean): void => {
    let m: RegExpExecArray | null;
    while ((m = re.exec(block)) !== null) {
      if (weaponShapedOnly && !WEAPON_REACH_OR_RANGE_RE.test(m[0])) continue;
      const label = m[1].trim();
      if (SPELL_ROW_LABEL_RE.test(label)) continue;
      const name = stripEditionTags(label);
      if (name && !excluded.has(name.toLowerCase())) names.push(name);
    }
  };
  collect(sectionBody(text, "ACTIONS"), false);
  collect(sectionBody(text, "BONUS ACTIONS"), true);
  return dedupeNames(names);
}

/**
 * `ddb_get_spell` result → spell card. The bridge output leads with
 * `**<Name>** — Level N School …`; we pull just the name so the widget can
 * re-render it from the bundled dataset (Wizard's-Tome styling). `markdown` is
 * kept as the fallback for spells not in the bundle.
 */
function parseSpellCard(text: string): ToolResultEvent {
  const m = /^\s*\*\*(.+?)\*\*/m.exec(text);
  const title = stripEditionTags(m ? m[1] : firstHeadingOrLine(text));
  return {
    type: "tool_result",
    tool: "ddb_get_spell",
    kind: "spell",
    title: title || "Spell",
    markdown: text,
  };
}

/**
 * Tools whose result is a raw data dump (not prose) that the assistant already
 * re-states in its reply — a card for them would just show unreadable JSON. We
 * suppress the card entirely (`parseToolResult` → null); the "tool used" chip
 * and the assistant's own summary carry the information.
 */
const SUPPRESSED_CARD_TOOLS = new Set(["ddb_list_characters"]);

/**
 * Cap on a single card's `markdown`. One oversized tool result (ddb_read_book
 * can return a whole chapter) would otherwise ride the wire into the widget's
 * persisted transcript, where a single message can blow the 900 KB store
 * budget — and past backup's 1 MB per-value cap, where it exports fine but is
 * SILENTLY SKIPPED on restore. 96 K chars keeps even a several-card message
 * comfortably under both while preserving far more than a preview card ever
 * renders. The client clamps again on persist (capChatMessages) as the
 * defense-in-depth for old bridges. Exported for tests.
 */
export const MAX_CARD_MARKDOWN_CHARS = 96_000;

const CARD_TRUNCATION_MARKER = "\n\n… (result truncated — ask Selene for a specific part)";

/** Truncate card markdown to MAX_CARD_MARKDOWN_CHARS with a visible marker.
 *  Fields/title parse from the full text BEFORE this runs, so a truncated
 *  stat block keeps its extracted AC/HP/CR. Exported for tests. */
export function capCardMarkdown(text: string): string {
  if (text.length <= MAX_CARD_MARKDOWN_CHARS) return text;
  return text.slice(0, MAX_CARD_MARKDOWN_CHARS - CARD_TRUNCATION_MARKER.length) + CARD_TRUNCATION_MARKER;
}

/**
 * Turn one resolved tool call into a `tool_result` event, or `null` to suppress
 * the card (see `SUPPRESSED_CARD_TOOLS`). `markdown` is always the full raw text
 * (graceful-degradation fallback); rich parsers extract best-effort `fields`.
 * `ddb_get_monster`, `ddb_get_character`, and `ddb_get_spell` get rich cards;
 * everything else (including `ddb_character_lookup`, a feature-description
 * lookup) is a generic titled card.
 */
export function parseToolResult(bareToolName: string, rawText: string): ToolResultEvent | null {
  if (SUPPRESSED_CARD_TOOLS.has(bareToolName)) return null;
  // The card is DM-facing: drop the model-facing untrusted-content delimiters
  // before parsing so they can't be read as a name line (see
  // stripUntrustedDelimiters). The model's own copy is untouched.
  const text = stripUntrustedDelimiters(rawText);
  let card: ToolResultEvent;
  if (bareToolName === "ddb_get_monster") card = parseMonsterCard(text);
  else if (bareToolName === "ddb_get_character") card = parseCharacterCard(text);
  else if (bareToolName === "ddb_get_spell") card = parseSpellCard(text);
  else {
    card = {
      type: "tool_result",
      tool: bareToolName,
      kind: "generic",
      // Generic prose has no reliable title in its body; prefer an explicit `#`
      // heading (spell/feature lookups have one), else the humanized tool name.
      title: firstHeading(text) || humanizeToolName(bareToolName),
      markdown: text,
    };
  }
  // Cap the markdown LAST so the rich parsers extracted fields/title/spell
  // lists from the complete text (see capCardMarkdown).
  return { ...card, markdown: capCardMarkdown(card.markdown) };
}
