// Shared helpers for the 5etools → static data generators.
//
// Source data: a local clone of https://github.com/5etools-mirror-3/5etools-src
// pinned to tag v2.31.0 (sibling of this repo at ../../../5etools-src by default).
// 5etools content is MIT-licensed; see attached LICENSE in their repo.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const REPO_ROOT = path.resolve(__dirname, "../../..");
export const FIVETOOLS_DIR =
  process.env["FIVETOOLS_DIR"] ?? path.resolve(REPO_ROOT, "../5etools-src");
export const FIVETOOLS_DATA_DIR = path.join(FIVETOOLS_DIR, "data");
export const DM_DATA_DIR = path.join(
  REPO_ROOT,
  "artifacts/dm-screen/src/data",
);

export function readJSON<T = unknown>(p: string): T {
  return JSON.parse(fs.readFileSync(p, "utf-8")) as T;
}

export function existsFile(p: string): boolean {
  return fs.existsSync(p) && fs.statSync(p).isFile();
}

// ── Strip 5etools {@tag text} formatting ─────────────────────────────────
// Two passes: first translate the zero-argument label tags the 2024 monster
// blocks use heavily ({@h}, {@actSaveFail}, etc.) into plain English; then
// collapse `{@tag content}` to its first pipe-separated segment (5etools
// rendering convention). Unknown braces unwrap.

const ZERO_ARG_TAGS: Record<string, string> = {
  h: "Hit: ",
  hom: "",
  hitYourSpellAttack: "your spell attack modifier",
  dcYourSpellSave: "your spell save DC",
  actSave: "Save: ",
  actSaveFail: "Failure: ",
  actSaveSuccess: "Success: ",
  actSaveSuccessOrFail: "Success or Failure: ",
  actTrigger: "Trigger: ",
  actResponse: "Response: ",
  recharge: "(Recharge)",
};

// Single-letter codes used as the argument of {@atk …} / {@atkr …}.
const ATTACK_CODES: Record<string, string> = {
  m: "Melee",
  r: "Ranged",
  mw: "Melee Weapon",
  rw: "Ranged Weapon",
  ms: "Melee Spell",
  rs: "Ranged Spell",
  mp: "Melee Power",
  rp: "Ranged Power",
};

function expandAtkArg(arg: string): string {
  return arg
    .split(",")
    .map((c) => ATTACK_CODES[c.trim()] ?? c.trim())
    .join(" or ");
}

// Unknown zero-arg tags are dropped silently so stray noise doesn't leak into
// prose — but a future 5etools release adding a new label tag would then lose
// its label with no signal. Set STRICT_TAGS=1 on a regen to log each unknown
// tag (once) to stderr so a maintainer can decide whether to map it in
// ZERO_ARG_TAGS. Off by default to keep normal regens quiet.
const STRICT_TAGS = process.env["STRICT_TAGS"] === "1";
const warnedUnknownTags = new Set<string>();
function noteUnknownZeroArgTag(tag: string): void {
  if (!STRICT_TAGS || warnedUnknownTags.has(tag)) return;
  warnedUnknownTags.add(tag);
  // eslint-disable-next-line no-console
  console.warn(`[stripTags] unknown zero-arg tag {@${tag}} dropped — map it in ZERO_ARG_TAGS if it carries meaning`);
}

export function stripTags(str: unknown): string {
  if (typeof str !== "string") return "";
  return (
    str
      // Zero-argument tags → friendly labels (or empty).
      .replace(/\{@(\w+)\}/g, (m, tag: string) => {
        if (Object.prototype.hasOwnProperty.call(ZERO_ARG_TAGS, tag)) {
          return ZERO_ARG_TAGS[tag]!;
        }
        noteUnknownZeroArgTag(tag);
        return ""; // unknown zero-arg tag — drop noise
      })
      // {@atk …} / {@atkr …} → expand attack-type codes.
      .replace(
        /\{@atkr?\s([^}]+)\}/gi,
        (_, arg: string) => `${expandAtkArg(arg)} Attack Roll: `,
      )
      // {@actSave int} → "Int Save: " (one-arg ability code).
      .replace(/\{@actSave\s+(str|dex|con|int|wis|cha)\}/gi, (_, abil: string) => {
        const cap = abil[0]!.toUpperCase() + abil.slice(1).toLowerCase();
        return `${cap} Save: `;
      })
      // {@hit N} → "+N" (signed). Some sources use negative numbers.
      .replace(/\{@hit\s([^}]+)\}/g, (_, n: string) => {
        const v = n.trim();
        return v.startsWith("-") || v.startsWith("+") ? v : `+${v}`;
      })
      // {@dc N} → "DC N".
      .replace(/\{@dc\s([^}]+)\}/g, (_, n: string) => `DC ${n.trim()}`)
      // {@scaledamage <base>|<levels>|<step>} and {@scaledice ...} encode
      // per-slot upcasting; the prose wants the STEP (3rd segment), not the
      // base. e.g. Fireball "8d6|3-9|1d6" → "1d6", Heal "70|6-9|10" → "10".
      .replace(/\{@scaled(?:amage|ice)\s+([^}]*)\}/g, (_, payload: string) =>
        (payload.split("|")[2] ?? "").trim(),
      )
      // Generic tag with payload → first pipe segment.
      .replace(/\{@\w+\s([^}]*)\}/g, (_, text: string) =>
        (text.split("|")[0] ?? "").trim(),
      )
      // Anything left in braces — unwrap.
      .replace(/\{([^}]+)\}/g, "$1")
      // Tidy double spaces introduced by replacements.
      .replace(/ {2,}/g, " ")
      .replace(/ +([,.;:])/g, "$1")
      .trim()
  );
}

// ── Render 5etools `entries` blocks to plain text ────────────────────────
export function renderEntries(entries: unknown, depth = 0): string {
  if (entries == null) return "";
  if (typeof entries === "string") return stripTags(entries);
  if (Array.isArray(entries)) {
    return entries
      .map((e) => renderEntries(e, depth))
      .filter((s) => s.length > 0)
      .join("\n");
  }
  if (typeof entries === "object") {
    const e = entries as Record<string, unknown>;
    const parts: string[] = [];
    if (typeof e["name"] === "string") {
      const prefix = depth > 0 ? "• " : "";
      parts.push(`${prefix}${stripTags(e["name"])}:`);
    }
    if (e["entries"]) parts.push(renderEntries(e["entries"], depth + 1));
    if (e["items"]) parts.push(renderEntries(e["items"], depth + 1));
    if (e["entry"]) parts.push(renderEntries(e["entry"], depth));
    if (Array.isArray(e["rows"])) {
      for (const row of e["rows"] as unknown[]) {
        if (Array.isArray(row)) {
          parts.push(row.map((c) => renderEntries(c)).join(" | "));
        }
      }
    }
    return parts.filter(Boolean).join("\n");
  }
  return String(entries);
}

// ── File header for generated outputs ────────────────────────────────────
export function generatedHeader(args: {
  source: string;
  generator: string;
  count?: number;
}): string {
  const { source, generator, count } = args;
  const countLine = count != null ? ` * Entries:    ${count}\n` : "";
  return `/**
 * GENERATED FILE — do not edit by hand.
 *
 * Source:     ${source}
 * Generator:  scripts/src/data-generators/${generator}
 * Pinned to:  5etools-src @ v2.31.0
 * License:    5etools content is MIT-licensed by its respective authors.
${countLine} *
 * Regenerate with: pnpm --filter @workspace/scripts run generate:<name>
 */
`;
}

// ── Pretty-printer: JSON-like literal with stable key order ──────────────
// Emits valid TS object literals (unquoted keys when safe). Useful for keeping
// the generated bestiary.ts roughly hand-readable. For very large arrays we
// use compact-JSON.
const IDENT_RE = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

export function tsLiteral(value: unknown, indent = 0): string {
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean")
    return String(value);
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    const inner = value
      .map((v) => " ".repeat(indent + 2) + tsLiteral(v, indent + 2))
      .join(",\n");
    return `[\n${inner},\n${" ".repeat(indent)}]`;
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj);
    if (keys.length === 0) return "{}";
    const inner = keys
      .map((k) => {
        const key = IDENT_RE.test(k) ? k : JSON.stringify(k);
        return `${" ".repeat(indent + 2)}${key}: ${tsLiteral(obj[k], indent + 2)}`;
      })
      .join(",\n");
    return `{\n${inner},\n${" ".repeat(indent)}}`;
  }
  return JSON.stringify(value);
}

export function writeOutput(filePath: string, contents: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, contents);
  // eslint-disable-next-line no-console
  console.log(
    `Wrote ${path.relative(REPO_ROOT, filePath)} (${contents.length.toLocaleString()} bytes)`,
  );
}
