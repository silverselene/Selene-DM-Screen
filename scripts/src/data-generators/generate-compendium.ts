// Expand the hand-curated compendium (artifacts/dm-screen/src/data/compendium.ts,
// left untouched) with bulk official/third-party rules text: feats, combat
// actions, skills, senses, and DMG/PHB-style variant rules from 5etools
// v2.31.0, plus feats unique to Open5e's non-WotC documents (Level Up A5e —
// CC-BY 4.0 — and Tome of Heroes / Critical Role Tal'Dorei — OGL). See
// OGL-NOTICE.md at the repo root for the third-party attribution this pulls
// in.
//
// Anything whose (normalized) name already exists as a hand-curated entry is
// skipped, so the DM's own summaries always win over the bulk text.

import fs from "node:fs";
import path from "node:path";

import {
  FIVETOOLS_DATA_DIR,
  OPEN5E_DATA_DIR,
  DM_DATA_DIR,
  readJSON,
  renderEntries,
  stripTags,
  generatedHeader,
  tsLiteral,
  writeOutput,
} from "./lib.js";
import { dedupeByName, slugify } from "./dedupe.js";

interface CompendiumEntry {
  id: string;
  title: string;
  category: string;
  content: string;
  tags: string[];
}

// Normalize a title so bulk entries don't duplicate a hand-curated one under
// a slightly different label ("Feat: Lucky" vs "Lucky", "... (2024)", etc).
function normalizeTitle(t: string): string {
  return t
    .replace(/^Feat:\s*/i, "")
    .replace(/^Weapon Mastery:\s*/i, "")
    .replace(/\s*\(2024\)\s*$/i, "")
    .replace(/\s*\(optional rule\)\s*$/i, "")
    .trim()
    .toLowerCase();
}

function loadExistingTitles(): Set<string> {
  const text = fs.readFileSync(path.join(DM_DATA_DIR, "compendium.ts"), "utf-8");
  const set = new Set<string>();
  for (const m of text.matchAll(/title: "((?:[^"\\]|\\.)*)"/g)) {
    set.add(normalizeTitle(m[1]!.replace(/\\"/g, '"')));
  }
  return set;
}

function parseJsonField<T>(raw: string | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return (JSON.parse(raw) as T) ?? fallback;
  } catch {
    return fallback;
  }
}

// ── Feats (5etools) ──────────────────────────────────────────────────────
const ABILITY_LABEL: Record<string, string> = {
  str: "Str",
  dex: "Dex",
  con: "Con",
  int: "Int",
  wis: "Wis",
  cha: "Cha",
};

function formatPrerequisite(prereq: unknown): string | null {
  if (!Array.isArray(prereq) || prereq.length === 0) return null;
  const altParts: string[] = [];
  for (const p of prereq) {
    if (!p || typeof p !== "object") continue;
    const obj = p as Record<string, unknown>;
    const parts: string[] = [];
    if (typeof obj["level"] === "number") {
      parts.push(`Level ${obj["level"]}`);
    } else if (obj["level"] && typeof obj["level"] === "object") {
      const lvl = obj["level"] as { level?: number; class?: { name?: string } };
      parts.push(`Level ${lvl.level ?? "?"}${lvl.class?.name ? ` (${lvl.class.name})` : ""}`);
    }
    if (Array.isArray(obj["ability"])) {
      for (const a of obj["ability"] as Array<Record<string, number>>) {
        for (const [k, v] of Object.entries(a)) {
          parts.push(`${ABILITY_LABEL[k] ?? k.toUpperCase()} ${v}+`);
        }
      }
    }
    if (Array.isArray(obj["race"])) {
      const names = (obj["race"] as Array<{ name?: string }>)
        .map((r) => r.name)
        .filter((n): n is string => Boolean(n));
      if (names.length) parts.push(names.join(" or "));
    }
    if (Array.isArray(obj["background"])) {
      const names = (obj["background"] as Array<{ name?: string }>)
        .map((b) => b.name)
        .filter((n): n is string => Boolean(n));
      if (names.length) parts.push(`${names.join(" or ")} background`);
    }
    if (Array.isArray(obj["proficiency"])) {
      for (const pr of obj["proficiency"] as Array<Record<string, string>>) {
        for (const [k, v] of Object.entries(pr)) parts.push(`proficiency with ${v} ${k}`);
      }
    }
    if (Array.isArray(obj["feature"])) {
      parts.push((obj["feature"] as string[]).join(" or "));
    }
    if (obj["spellcasting"] || obj["spellcasting2020"] || obj["spellcastingFeature"]) {
      parts.push("Spellcasting or Pact Magic feature");
    }
    if (Array.isArray(obj["feat"])) {
      const names = (obj["feat"] as string[]).map((f) => stripTags(f.split("|")[0] ?? f));
      if (names.length) parts.push(`${names.join(" or ")} feat`);
    }
    if (typeof obj["other"] === "string") parts.push(stripTags(obj["other"]));
    if (obj["otherSummary"] && typeof obj["otherSummary"] === "object") {
      const s = obj["otherSummary"] as { entrySummary?: string; entry?: string };
      const text = s.entrySummary || s.entry;
      if (text) parts.push(stripTags(text));
    }
    if (parts.length > 0) altParts.push(parts.join(", "));
  }
  return altParts.length > 0 ? altParts.join("; or ") : null;
}

interface FiveToolsFeat {
  name: string;
  source?: string;
  prerequisite?: unknown;
  entries?: unknown;
}

function loadFeats(existingTitles: Set<string>): CompendiumEntry[] {
  const data = readJSON<{ feat: FiveToolsFeat[] }>(path.join(FIVETOOLS_DATA_DIR, "feats.json"));
  const deduped = dedupeByName(data.feat);
  const out: CompendiumEntry[] = [];
  for (const f of deduped) {
    if (existingTitles.has(normalizeTitle(f.name))) continue;
    const prereq = formatPrerequisite(f.prerequisite);
    const body = renderEntries(f.entries);
    out.push({
      id: `feat-${slugify(f.name)}`,
      title: f.name,
      category: "Feats",
      content: prereq ? `Prerequisite: ${prereq}.\n\n${body}` : body,
      tags: ["feat", "official", (f.source ?? "").toLowerCase()].filter(Boolean),
    });
  }
  return out;
}

// ── Actions in Combat (5etools) ──────────────────────────────────────────
interface FiveToolsAction {
  name: string;
  source?: string;
  entries?: unknown;
}

function loadActions(existingTitles: Set<string>): CompendiumEntry[] {
  const data = readJSON<{ action: FiveToolsAction[] }>(path.join(FIVETOOLS_DATA_DIR, "actions.json"));
  const deduped = dedupeByName(data.action);
  const out: CompendiumEntry[] = [];
  for (const a of deduped) {
    if (existingTitles.has(normalizeTitle(a.name))) continue;
    out.push({
      id: `action-${slugify(a.name)}`,
      title: a.name,
      category: "Actions in Combat",
      content: renderEntries(a.entries),
      tags: ["action", "official", (a.source ?? "").toLowerCase()].filter(Boolean),
    });
  }
  return out;
}

// ── Skills (5etools) ──────────────────────────────────────────────────────
interface FiveToolsSkill {
  name: string;
  source?: string;
  ability?: string;
  entries?: unknown;
}

function loadSkills(existingTitles: Set<string>): CompendiumEntry[] {
  const data = readJSON<{ skill: FiveToolsSkill[] }>(path.join(FIVETOOLS_DATA_DIR, "skills.json"));
  const deduped = dedupeByName(data.skill);
  const out: CompendiumEntry[] = [];
  for (const s of deduped) {
    if (existingTitles.has(normalizeTitle(s.name))) continue;
    const abilityLabel = s.ability ? ABILITY_LABEL[s.ability] ?? s.ability.toUpperCase() : null;
    const body = renderEntries(s.entries);
    out.push({
      id: `skill-${slugify(s.name)}`,
      title: s.name,
      category: "Skills",
      content: abilityLabel ? `Governing ability: ${abilityLabel}.\n\n${body}` : body,
      tags: ["skill", "official", s.ability ?? "", (s.source ?? "").toLowerCase()].filter(Boolean),
    });
  }
  return out;
}

// ── Senses (5etools) ──────────────────────────────────────────────────────
interface FiveToolsSense {
  name: string;
  source?: string;
  entries?: unknown;
}

function loadSenses(existingTitles: Set<string>): CompendiumEntry[] {
  const data = readJSON<{ sense: FiveToolsSense[] }>(path.join(FIVETOOLS_DATA_DIR, "senses.json"));
  const deduped = dedupeByName(data.sense);
  const out: CompendiumEntry[] = [];
  for (const s of deduped) {
    if (existingTitles.has(normalizeTitle(s.name))) continue;
    out.push({
      id: `sense-${slugify(s.name)}`,
      title: s.name,
      category: "Senses",
      content: renderEntries(s.entries),
      tags: ["sense", "official", (s.source ?? "").toLowerCase()].filter(Boolean),
    });
  }
  return out;
}

// ── Variant/optional rules (5etools) ──────────────────────────────────────
interface FiveToolsVariantRule {
  name: string;
  source?: string;
  entries?: unknown;
}

function loadVariantRules(existingTitles: Set<string>): CompendiumEntry[] {
  const data = readJSON<{ variantrule: FiveToolsVariantRule[] }>(
    path.join(FIVETOOLS_DATA_DIR, "variantrules.json"),
  );
  const deduped = dedupeByName(data.variantrule);
  const out: CompendiumEntry[] = [];
  for (const v of deduped) {
    if (existingTitles.has(normalizeTitle(v.name))) continue;
    out.push({
      id: `variant-${slugify(v.name)}`,
      title: v.name,
      category: "Variant Rules",
      content: renderEntries(v.entries),
      tags: ["variant rule", "official", (v.source ?? "").toLowerCase()].filter(Boolean),
    });
  }
  return out;
}

// ── Open5e third-party feats (not covered by 5etools) ─────────────────────
// wotc-srd feats are already covered by the 5etools pass above (5etools
// mirrors official WotC content); only pull the documents 5etools doesn't
// carry at all.
const OPEN5E_FEAT_SLUGS: Record<string, { tag: string }> = {
  a5e: { tag: "a5e" },
  toh: { tag: "tome of heroes" },
  taldorei: { tag: "taldorei" },
};

interface Open5eFeatFields {
  name: string;
  desc?: string;
  effects_desc_json?: string;
  prerequisite?: string;
}

function loadOpen5eFeats(existingTitles: Set<string>): CompendiumEntry[] {
  const out: CompendiumEntry[] = [];
  for (const [slug, meta] of Object.entries(OPEN5E_FEAT_SLUGS)) {
    const file = path.join(OPEN5E_DATA_DIR, slug, "Feat.json");
    const records = readJSON<Array<{ fields: Open5eFeatFields }>>(file);
    for (const r of records) {
      const f = r.fields;
      if (existingTitles.has(normalizeTitle(f.name))) continue;
      // Effect bullets sometimes already carry a leading "* " (toh), sometimes
      // not (a5e) — strip and re-add a uniform bullet so both render the same.
      const effects = parseJsonField<string[]>(f.effects_desc_json, []).map(
        (e) => `• ${e.replace(/^\*\s*/, "").trim()}`,
      );
      const prereqRaw = (f.prerequisite ?? "")
        .replace(/\*/g, "")
        .replace(/^prerequisite:?\s*/i, "")
        .trim();
      const prereq = prereqRaw && prereqRaw.toLowerCase() !== "n/a" ? prereqRaw : null;
      const body = [f.desc, ...effects].filter(Boolean).join("\n\n");
      out.push({
        id: `feat-${slug}-${slugify(f.name)}`,
        title: f.name,
        category: "Feats",
        content: prereq ? `Prerequisite: ${prereq}\n\n${body}` : body,
        tags: ["feat", "third-party", meta.tag],
      });
    }
  }
  return out;
}

function main() {
  const existingTitles = loadExistingTitles();
  console.log(`  ${existingTitles.size} hand-curated titles loaded (will be skipped if seen again)`);

  const sections: Array<[string, CompendiumEntry[]]> = [
    ["Feats (5etools)", loadFeats(existingTitles)],
    ["Actions in Combat (5etools)", loadActions(existingTitles)],
    ["Skills (5etools)", loadSkills(existingTitles)],
    ["Senses (5etools)", loadSenses(existingTitles)],
    ["Variant Rules (5etools)", loadVariantRules(existingTitles)],
    ["Feats (Open5e third-party)", loadOpen5eFeats(existingTitles)],
  ];

  const entries: CompendiumEntry[] = [];
  for (const [label, section] of sections) {
    console.log(`  ${label}: ${section.length} entries`);
    entries.push(...section);
  }

  entries.sort((a, b) => a.category.localeCompare(b.category) || a.title.localeCompare(b.title));

  const header = generatedHeader({
    source:
      "../5etools-src/data/{feats,actions,skills,senses,variantrules}.json + ../open5e-api/data/v1/{a5e,toh,taldorei}/Feat.json (OGL/CC-BY — see OGL-NOTICE.md)",
    generator: "generate-compendium.ts",
    count: entries.length,
  });

  const body = `
import type { CompendiumEntry } from "./compendium";

export const compendiumRulesData: CompendiumEntry[] = ${tsLiteral(entries)};
`;

  writeOutput(path.join(DM_DATA_DIR, "compendiumRules.ts"), header + body);
}

main();
