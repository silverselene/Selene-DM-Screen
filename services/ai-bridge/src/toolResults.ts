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
  return {
    type: "tool_result",
    tool: "ddb_get_character",
    kind: "character",
    title: title || firstHeadingOrLine(text) || "Character",
    ...(Object.keys(fields).length ? { fields } : {}),
    markdown: text,
  };
}

/**
 * Turn one resolved tool call into a `tool_result` event. `markdown` is always
 * the full raw text (graceful-degradation fallback); rich parsers extract
 * best-effort `fields`. Only `ddb_get_monster` and `ddb_get_character` get rich
 * cards; everything else (including `ddb_character_lookup`, a feature-description
 * lookup) is a generic titled card.
 */
export function parseToolResult(bareToolName: string, text: string): ToolResultEvent {
  if (bareToolName === "ddb_get_monster") return parseMonsterCard(text);
  if (bareToolName === "ddb_get_character") return parseCharacterCard(text);
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
