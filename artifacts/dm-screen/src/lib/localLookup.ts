// Phase 5: bundled-data-first routing. Pure client-side lookup over the bundled
// spells / monsters / compendium datasets so common rules questions never need
// the optional AI bridge. Slash commands (/spell, /monster, /rule) are the
// reliable path; free-text auto-detection is a conservative bonus for bare
// entity names. See docs/superpowers/specs/2026-07-10-phase5-bundled-data-first-routing-design.md.

import type { ToolResultCard } from "@/lib/cardHandoff";
import type { Spell } from "@/data/spells";
import type { MonsterEntry, MonsterTrait } from "@/data/monsters";
import type { CompendiumEntry } from "@/data/compendium";
import { spellData } from "@/data/spells";
import { monsters } from "@/data/monsters";
import { searchMonsters } from "@/lib/monsterSearch";
import { compendiumData } from "@/data/compendium";
import { compendiumRulesData } from "@/data/compendiumRules";

export type LookupDataset = "spell" | "monster" | "rule";

// Leading filler phrases stripped before an exact match. Kept short and safe:
// we strip only a leading prefix, never trailing words (mangling a name is
// worse than missing a match), so "what does fireball do" stays "fireball do".
const LEADING_FILLERS = [
  "what is",
  "what's",
  "whats",
  "what does",
  "tell me about",
  "define",
  "explain",
];

/** Lowercase, trim, collapse internal whitespace, drop a trailing "?", then
 *  strip one leading filler phrase and a single leading "the". */
export function normalizeQuery(raw: string): string {
  let s = raw.trim().toLowerCase().replace(/\s+/g, " ").replace(/\?+$/, "").trim();
  for (const f of LEADING_FILLERS) {
    if (s === f || s.startsWith(f + " ")) {
      s = s.slice(f.length).trim();
      break;
    }
  }
  if (s === "the") return "";
  if (s.startsWith("the ")) s = s.slice(4).trim();
  return s;
}

const COMMANDS: Record<string, LookupDataset> = {
  "/spell": "spell",
  "/monster": "monster",
  "/rule": "rule",
};

/** Parse "/spell fireball" → { dataset:"spell", arg:"fireball" }. The arg is
 *  returned verbatim (not normalized) so the dataset lookups own normalization.
 *  Returns null for anything that isn't one of the three lookup commands. */
export function parseLookupCommand(
  raw: string,
): { dataset: LookupDataset; arg: string } | null {
  const trimmed = raw.trim();
  const m = /^(\/\S+)\s*([\s\S]*)$/.exec(trimmed);
  if (!m) return null;
  const dataset = COMMANDS[m[1].toLowerCase()];
  if (!dataset) return null;
  return { dataset, arg: m[2].trim() };
}

/** Synthetic `tool` value on locally-built cards. The Phase-4 hand-off ignores
 *  it; it exists only so the card shape is complete. */
export const LOCAL_TOOL = "local_lookup";

/** Spell → spell card. `title` is the spell name so the widget re-renders it
 *  from the bundled dataset with the Wizard's-Tome styling (see
 *  `resolveBundledSpell` / SpellCardBody). `markdown` is a text rendering kept as
 *  the fallback for any consumer that can't resolve the name. */
export function toSpellCard(spell: Spell): ToolResultCard {
  const flags: string[] = [];
  if (spell.ritual) flags.push("ritual");
  if (spell.concentration) flags.push("concentration");
  const header =
    `**Level ${spell.level} ${spell.school}** · ${spell.castingTime} · ` +
    `${spell.range} · ${spell.components} · ${spell.duration}` +
    (flags.length ? ` · _${flags.join(", ")}_` : "");
  const parts = [header, "", spell.description];
  if (spell.upcast) parts.push("", `**At higher levels.** ${spell.upcast}`);
  if (spell.classes.length) parts.push("", `_Classes: ${spell.classes.join(", ")}_`);
  return { type: "tool_result", tool: LOCAL_TOOL, kind: "spell", title: spell.name, markdown: parts.join("\n") };
}

// Bundled spells keyed by normalized name, for re-rendering a `spell` card (from
// a local lookup or the AI bridge's `ddb_get_spell`) with the shared Wizard's
// Tome styling. First-wins on the rare chance of a normalized-name collision.
const spellByName = new Map<string, Spell>();
for (const s of spellData) {
  const key = normalizeQuery(s.name);
  if (!spellByName.has(key)) spellByName.set(key, s);
}

/** Resolve a spell card's title to its bundled `Spell`, or null when the name
 *  isn't in the 557-spell dataset (e.g. homebrew) — the caller then falls back
 *  to the card's markdown. */
export function resolveBundledSpell(name: string): Spell | null {
  return spellByName.get(normalizeQuery(name)) ?? null;
}

function traitBlock(label: string, traits: MonsterTrait[] | undefined): string[] {
  if (!traits || traits.length === 0) return [];
  const lines = [`**${label}**`];
  for (const t of traits) lines.push(`- **${t.name}.** ${t.desc}`);
  lines.push("");
  return lines;
}

/** Monster → monster card. `fields` drive the AC/HP/CR/Speed chips and the
 *  Phase-4 Add-to-Initiative hand-off; `markdown` is the collapsible full block
 *  (rich fields when the entry carries them, thin header otherwise). */
export function toMonsterCard(m: MonsterEntry): ToolResultCard {
  const fields: Record<string, string> = {
    ac: String(m.ac),
    hp: m.hp,
    cr: m.cr,
    type: m.type,
  };
  if (m.speed) fields.speed = m.speed;

  const body: string[] = [`_${m.size} ${m.type}, ${m.alignment}_`, ""];
  body.push(`**AC** ${m.ac}${m.acType ? ` (${m.acType})` : ""}  ·  **HP** ${m.hp}  ·  **CR** ${m.cr}`);
  if (m.speed) body.push(`**Speed** ${m.speed}`);
  const abil = (["str", "dex", "con", "int", "wis", "cha"] as const)
    .filter((k) => m[k] !== undefined)
    .map((k) => `${k.toUpperCase()} ${m[k]}`);
  if (abil.length) body.push(`**Abilities** ${abil.join(" · ")}`);
  if (m.senses) body.push(`**Senses** ${m.senses}`);
  if (m.languages) body.push(`**Languages** ${m.languages}`);
  body.push("");
  body.push(...traitBlock("Traits", m.traits));
  body.push(...traitBlock("Actions", m.actions));
  body.push(...traitBlock("Reactions", m.reactions));
  body.push(...traitBlock("Legendary Actions", m.legendaryActions));

  return {
    type: "tool_result",
    tool: LOCAL_TOOL,
    kind: "monster",
    title: m.name,
    fields,
    markdown: body.join("\n").trim(),
  };
}

/** Compendium entry (condition / action / feat / rule) → generic markdown card. */
export function toRuleCard(entry: CompendiumEntry): ToolResultCard {
  const markdown = `_${entry.category}_\n\n${entry.content}`;
  return { type: "tool_result", tool: LOCAL_TOOL, kind: "generic", title: entry.title, markdown };
}

const CANDIDATE_CAP = 6;

export interface LookupResult {
  exact: ToolResultCard | null;
  candidates: { name: string; card: ToolResultCard }[];
}

// The compendium the /rule command searches: union of the hand-curated entries
// and the generated bulk rules, matching how CompendiumWidget merges them.
const allRules: CompendiumEntry[] = [...compendiumData, ...compendiumRulesData];

// Resolve a monster name to its full entry (searchMonsters returns thin hits).
// The current dataset has no normalized-name collisions, but build the map
// first-wins anyway so that if a future regen introduces a dup name the lookup
// stays deterministic (keeps the earlier entry) instead of silently returning
// whichever happened to be listed last.
const monsterByName = new Map<string, MonsterEntry>();
for (const m of monsters) {
  const key = normalizeQuery(m.name);
  if (!monsterByName.has(key)) monsterByName.set(key, m);
}

function eq(a: string, b: string): boolean {
  return normalizeQuery(a) === normalizeQuery(b);
}

/** Search one dataset: an exact-name card plus up to CANDIDATE_CAP substring
 *  candidates (candidates exclude the exact match). */
export function lookupDataset(dataset: LookupDataset, arg: string): LookupResult {
  const q = normalizeQuery(arg);
  if (!q) return { exact: null, candidates: [] };

  if (dataset === "spell") {
    const exactSpell = spellData.find((s) => eq(s.name, arg));
    const cands = spellData
      .filter((s) => normalizeQuery(s.name).includes(q) && !eq(s.name, arg))
      .slice(0, CANDIDATE_CAP)
      .map((s) => ({ name: s.name, card: toSpellCard(s) }));
    return { exact: exactSpell ? toSpellCard(exactSpell) : null, candidates: cands };
  }

  if (dataset === "monster") {
    const exactEntry = monsterByName.get(q) ?? null;
    const cands = searchMonsters(arg, CANDIDATE_CAP + 1)
      .filter((h) => !eq(h.name, arg))
      .slice(0, CANDIDATE_CAP)
      .map((h) => {
        const entry = monsterByName.get(normalizeQuery(h.name));
        return entry ? { name: h.name, card: toMonsterCard(entry) } : null;
      })
      .filter((c): c is { name: string; card: ToolResultCard } => c !== null);
    return { exact: exactEntry ? toMonsterCard(exactEntry) : null, candidates: cands };
  }

  // rule
  const exactRule = allRules.find((e) => eq(e.title, arg));
  const cands = allRules
    .filter((e) => normalizeQuery(e.title).includes(q) && !eq(e.title, arg))
    .slice(0, CANDIDATE_CAP)
    .map((e) => ({ name: e.title, card: toRuleCard(e) }));
  return { exact: exactRule ? toRuleCard(exactRule) : null, candidates: cands };
}

/** Free-text auto-detect: fire only on a UNIQUE exact match across the union of
 *  all three datasets. Zero, partial-only, or >1 exact (cross-dataset name
 *  collision) → null (caller sends to the bridge). */
export function autoDetectLocal(raw: string): ToolResultCard | null {
  const q = normalizeQuery(raw);
  if (!q) return null;
  const hits: ToolResultCard[] = [];

  const spell = spellData.find((s) => normalizeQuery(s.name) === q);
  if (spell) hits.push(toSpellCard(spell));

  const monster = monsterByName.get(q);
  if (monster) hits.push(toMonsterCard(monster));

  const rule = allRules.find((e) => normalizeQuery(e.title) === q);
  if (rule) hits.push(toRuleCard(rule));

  return hits.length === 1 ? hits[0] : null;
}
