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
  const lines = text.split("\n").map((l) => l.trim());
  let seenTitle = false;
  for (const line of lines) {
    if (line === "") continue;
    if (!seenTitle) {
      seenTitle = true;
      continue;
    }
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
    title: firstHeadingOrLine(text),
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
    fields.race = idLine[1].trim();
    fields.class = idLine[2].trim();
    fields.level = idLine[3].trim();
    // Name is the non-empty line directly above the identity line (skip box rules).
    const lines = text.split("\n");
    const idx = lines.findIndex((l) => /\|\s*Level\s+\d+\s*$/.test(l));
    for (let i = idx - 1; i >= 0; i--) {
      const t = lines[i].replace(/[═─—]+/g, "").trim();
      if (t) {
        title = t;
        break;
      }
    }
  }
  addField(fields, "background", /^\s*Background:\s*([^\n|]+)/m, text);
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
  const re = /^\s*(?:Cantrips|Spells|From [^:\n]+):\s*(.+)$/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(block)) !== null) {
    for (const raw of m[1].split(",")) {
      names.push(raw.replace(/\s*\(L\d+[^)]*\)\s*$/, ""));
    }
  }
  return dedupeNames(names);
}

/**
 * Extract weapon names from a character sheet's ACTIONS block. Each weapon
 * attack is a `• <name>   <+N> to hit   …` line (name padded to 16 chars, an
 * optional `×N` quantity prefix). Anchoring on the `to hit` clause skips the
 * non-weapon `•` bullets under BONUS ACTIONS / REACTIONS. `exclude` drops names
 * that are really spells (an attack cantrip in ACTIONS carries a `to hit` too).
 * De-duplicated, order preserved.
 */
export function parseSheetWeapons(text: string, exclude: readonly string[] = []): string[] {
  const excluded = new Set(exclude.map((s) => s.toLowerCase()));
  const names: string[] = [];
  const re = /^\s*•\s*(?:×\d+\s+)?(.+?)\s+[+\-]?\d+\s+to hit\b/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const name = m[1].trim();
    if (!excluded.has(name.toLowerCase())) names.push(name);
  }
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
  const title = (m ? m[1] : firstHeadingOrLine(text)).trim();
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
 * Turn one resolved tool call into a `tool_result` event, or `null` to suppress
 * the card (see `SUPPRESSED_CARD_TOOLS`). `markdown` is always the full raw text
 * (graceful-degradation fallback); rich parsers extract best-effort `fields`.
 * `ddb_get_monster`, `ddb_get_character`, and `ddb_get_spell` get rich cards;
 * everything else (including `ddb_character_lookup`, a feature-description
 * lookup) is a generic titled card.
 */
export function parseToolResult(bareToolName: string, text: string): ToolResultEvent | null {
  if (SUPPRESSED_CARD_TOOLS.has(bareToolName)) return null;
  if (bareToolName === "ddb_get_monster") return parseMonsterCard(text);
  if (bareToolName === "ddb_get_character") return parseCharacterCard(text);
  if (bareToolName === "ddb_get_spell") return parseSpellCard(text);
  return {
    type: "tool_result",
    tool: bareToolName,
    kind: "generic",
    // Generic prose has no reliable title in its body; prefer an explicit `#`
    // heading (spell/feature lookups have one), else the humanized tool name.
    title: firstHeading(text) || humanizeToolName(bareToolName),
    markdown: text,
  };
}
