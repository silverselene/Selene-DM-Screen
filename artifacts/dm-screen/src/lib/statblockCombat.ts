// Derives a monster's usable combat options — its attacks (weapon and spell),
// its save-forcing actions, and the spells it can cast — out of the free-text
// `traits`/`actions`/`reactions`/`legendaryActions` the bundled dataset carries.
//
// WHY PARSE AT ALL. `monsters.ts` stores each action as `{ name, desc }` prose
// (that is what both upstream sources give us — 5etools tag macros already
// flattened to English by `stripTags`), so "what can this thing actually DO on
// its turn" is only answerable by reading paragraphs. At the table that is the
// question the DM asks every single round, so the Bestiary stat block and the
// Initiative tracker both surface it structurally: to-hit, reach/range and
// damage as fields, and spell lists resolved against the bundled 557-spell
// dataset so the DM can read the actual spell without leaving the widget.
//
// The prose is NOT uniform — the dataset merges 2014 WotC ("Melee Weapon
// Attack: +8 to hit, reach 5 ft., one target. Hit: 12 (2d6 + 5) piercing
// damage."), 2024 WotC ("Melee Attack Roll: +9, reach 15 ft. Hit: ..."), and
// Kobold Press / Level Up A5e via Open5e, which compresses the same line to
// "+8 to hit, 10 ft., one target, 18 (3d8+5) slashing damage." with no `Hit:`
// label at all. So every extractor here is deliberately tolerant, and
// **every parsed result keeps its source `desc`**: the UI renders the parsed
// fields as a summary line ABOVE the untouched original text. That is the
// invariant that makes a heuristic parser safe to ship — a miss degrades to
// "the DM reads the same sentence they read before", never to lost data.
//
// Pure and data-only (no React), so it is testable in the Node env. It imports
// the spells and weapons datasets — both their own Rollup chunks — but not
// `monsters.ts`; callers pass the entry in. Resolving a *combatant name* back to
// a monster is `findRichMonster`/`findCombatantMonster` in `monsterSearch.ts`,
// which is where the monsters dataset import lives.

import type { MonsterTrait } from "@/data/monsters";
import { spellData, type Spell } from "@/data/spells";
import { weaponsData, type Weapon } from "@/data/weapons";

// ── Public shapes ────────────────────────────────────────────────────────────

/** Which section of the stat block an option came from, so the UI can label a
 *  legendary action or a reaction rather than implying it costs an Action. */
export type OptionOrigin = "action" | "reaction" | "legendary" | "trait";

export type AttackKind = "melee" | "ranged" | "melee-or-ranged";

/** One damage clause of an attack. Any field can be absent because the source
 *  text can be: `12 (2d6 + 5) piercing` (all three), `18 (3d6 + 8) plus 3 (1d6)
 *  poison` (the first clause's type was dropped upstream), or a flat
 *  `5 piercing damage` (no dice). */
export interface DamageInstance {
  /** The printed average, e.g. 12 — what a DM who doesn't roll uses. */
  average: number | null;
  /** Dice expression as printed, e.g. "2d6 + 5". */
  dice: string | null;
  /** Lowercased damage type, e.g. "piercing". Null when the text omitted it. */
  type: string | null;
}

/** A saving throw an option forces — either as an attack's rider ("or be
 *  knocked prone") or as the whole point of the action (a breath weapon). */
export interface SaveRequirement {
  /** Full ability name as printed, e.g. "Dexterity". */
  ability: string;
  dc: number;
}

/** The bundled weapon a mundane weapon attack was made with, when the action's
 *  name is a real weapon ("Longsword", "Heavy Crossbow" — ~40 distinct names
 *  across the dataset). Gives the DM the properties the stat block omits:
 *  Versatile, Loading, Reach, Thrown. */
export interface WeaponRef {
  name: string;
  category: string | null;
  damage: string | null;
  damageType: string | null;
  properties: string[];
}

export interface MonsterAttack {
  name: string;
  origin: OptionOrigin;
  kind: AttackKind;
  /** A "Melee/Ranged Spell Attack" rather than a weapon attack. */
  isSpellAttack: boolean;
  toHit: number;
  /** Melee reach as printed, e.g. "5 ft.". */
  reach: string | null;
  /** Ranged range as printed, e.g. "80/320 ft.". */
  range: string | null;
  damage: DamageInstance[];
  save: SaveRequirement | null;
  weapon: WeaponRef | null;
  desc: string;
}

/** An offensive action that forces a save instead of making an attack roll —
 *  a dragon's breath, a beholder's ray, Frightful Presence. Without these the
 *  "Attacks" view would be conspicuously empty for exactly the monsters whose
 *  signature move matters most. */
export interface MonsterSaveAction {
  name: string;
  origin: OptionOrigin;
  save: SaveRequirement;
  damage: DamageInstance[];
  desc: string;
}

export interface SpellGroup {
  /** Header as printed, title-cased: "At Will", "3/Day Each", "1st Level (4 Slots)". */
  label: string;
  spells: Spell[];
}

export interface SpellcastingBlock {
  /** The trait/action name: "Spellcasting", "Innate Spellcasting (3/Day)". */
  name: string;
  origin: OptionOrigin;
  /** Spellcasting ability as printed, e.g. "Charisma". */
  ability: string | null;
  saveDc: number | null;
  /** Spell attack bonus, e.g. +10, when the text states one. */
  attackBonus: number | null;
  groups: SpellGroup[];
  desc: string;
}

export interface CombatOptions {
  attacks: MonsterAttack[];
  saveActions: MonsterSaveAction[];
  spellcasting: SpellcastingBlock[];
  /** The Multiattack action's text, which governs how many of `attacks` the
   *  monster gets in one turn — useless to parse, essential to show. */
  multiattack: string | null;
  /** How many spells were resolved across every block, so a caller can badge
   *  "12 spells" without walking the groups. */
  spellCount: number;
}

/** The subset of a `MonsterEntry` this module reads. Typed structurally so both
 *  `MonsterEntry` and the Bestiary's `UnifiedMonster` (which fills the optional
 *  arrays in) satisfy it without a conversion step. */
export interface StatblockSections {
  traits?: MonsterTrait[];
  actions?: MonsterTrait[];
  reactions?: MonsterTrait[];
  legendaryActions?: MonsterTrait[];
}

// ── Text normalization ───────────────────────────────────────────────────────

// Curly apostrophes appear on both sides of the spell-name match (the dataset
// has "can’t speak"; 5etools spell names use straight quotes) and markdown
// emphasis wraps spell names in the 2024 entries ("_dancing lights_"). `_` is a
// word character, so `\b` would refuse to match inside `_dancing lights_` —
// hence the emphasis strip rather than a cleverer boundary.
function normalizeText(s: string): string {
  return s.replace(/[‘’]/g, "'").replace(/[_*]+/g, " ");
}

/** Lowercased, punctuation-normalized key for name matching. */
function nameKey(s: string): string {
  return normalizeText(s).toLowerCase().replace(/\s+/g, " ").trim();
}

const DAMAGE_TYPES = [
  "acid", "bludgeoning", "cold", "fire", "force", "lightning", "necrotic",
  "piercing", "poison", "psychic", "radiant", "slashing", "thunder",
] as const;

const DAMAGE_TYPE_SET: ReadonlySet<string> = new Set(DAMAGE_TYPES);

const ABILITIES = [
  "Strength", "Dexterity", "Constitution", "Intelligence", "Wisdom", "Charisma",
] as const;

// ── Attack line ──────────────────────────────────────────────────────────────

// Covers every prefix present in the dataset: "Melee Weapon Attack:",
// "Melee Attack Roll:", "Ranged Weapon Attack:", "Melee or Ranged Weapon
// Attack:", "Ranged Spell Attack:", "Melee Weapon Attack Roll:",
// "Ranged Attack:". The bonus is captured straight after the colon, which also
// swallows the 2014 "+8 to hit" form (the "to hit" is left in the tail and
// ignored). Every one of the 3,593 attack entries in the current dataset
// yields a to-hit through this.
const ATTACK_LINE =
  /(melee or ranged|melee|ranged)\s+(weapon\s+|spell\s+)?attack(?:\s+roll)?\s*:\s*([+-]?\d+)/i;

const REACH = /reach\s+(\d+)\s*(?:ft\.?|feet)/i;
const RANGE = /range\s+(\d+(?:\/\d+)?)\s*(?:ft\.?|feet|')/i;
// Open5e/A5e compression: "+8 to hit, 10 ft., one target, ...". The distance
// sits right after the to-hit with no `reach` keyword, so it is only read when
// neither keyword matched — an unlabelled number is too weak a signal to
// override an explicit one.
const BARE_REACH = /^[\s,]*(?:to hit[\s,]*)?(\d+)\s*(?:ft\.?|feet|')/i;

// Dice-bearing damage: "12 (2d6 + 5)". The inner group is restricted to
// dice arithmetic so the scan cannot mistake "(escape DC 16)" or
// "(Costs 2 Actions)" for damage, and must contain an actual NdN.
const DICE_DAMAGE = /(\d+)\s*\(\s*([\dd\s+\-*x×]{1,32}?)\s*\)/gi;
const HAS_DICE = /\d+\s*d\s*\d+/i;
// Flat damage with no dice at all ("Hit: 5 piercing damage."), consulted only
// when the dice scan came up empty.
const FLAT_DAMAGE = new RegExp(
  String.raw`(\d+)\s+(${DAMAGE_TYPES.join("|")})\s+damage`,
  "i",
);

// 2024 phrasing, which leads with the ability and states the DC after it. Both
// spellings are in the dataset: "Dexterity Saving Throw: DC 21" (XMM prose) and
// the abbreviated "Dex Save: DC 21" that `stripTags` produces from the
// `{@actSave dex}` macro. Full ability names are listed before the
// abbreviations so "Constitution" is preferred over a bare "Con" prefix.
const SAVE_2024 = new RegExp(
  String.raw`(${ABILITIES.join("|")}|Str|Dex|Con|Int|Wis|Cha)\s+Sav(?:e|ing\s+Throw)\s*:?\s*DC\s*(\d+)`,
  "i",
);
const SAVE_2014 = new RegExp(
  String.raw`DC\s*(\d+)\s+(${ABILITIES.join("|")}|Str|Dex|Con|Int|Wis|Cha)\b[^.]{0,20}?sav`,
  "i",
);

const ABBREV_ABILITY: Record<string, string> = {
  str: "Strength", dex: "Dexterity", con: "Constitution",
  int: "Intelligence", wis: "Wisdom", cha: "Charisma",
};

function titleCaseAbility(raw: string): string {
  const lower = raw.toLowerCase();
  return ABBREV_ABILITY[lower] ?? lower.charAt(0).toUpperCase() + lower.slice(1);
}

/** The save an option forces, or null. Prefers the explicit 2024 block. */
export function parseSave(desc: string): SaveRequirement | null {
  const m2024 = SAVE_2024.exec(desc);
  if (m2024) return { ability: titleCaseAbility(m2024[1]), dc: Number(m2024[2]) };
  const m2014 = SAVE_2014.exec(desc);
  if (m2014) return { ability: titleCaseAbility(m2014[2]), dc: Number(m2014[1]) };
  return null;
}

// A parsed attack rarely needs more than two damage clauses (base + a rider
// like "plus 7 (2d6) poison"); a long action's later prose can contain further
// dice that are conditional, not part of the hit. Cap so the summary line stays
// a summary — the full text is always rendered beneath it.
const MAX_DAMAGE_INSTANCES = 4;

/**
 * Pull the damage clauses out of an attack/action body.
 *
 * The damage TYPE is resolved by looking at the text that follows the dice: the
 * first damage-type keyword within the next stretch of text wins, unless
 * another `N (dice)` group opens first — in "18 (3d6 + 8) plus 3 (1d6) poison
 * damage" that lookahead correctly refuses to label the first clause "poison"
 * (its own type was dropped by the upstream source) instead of mislabelling it.
 */
export function parseDamage(body: string): DamageInstance[] {
  const out: DamageInstance[] = [];
  DICE_DAMAGE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = DICE_DAMAGE.exec(body)) !== null) {
    if (out.length >= MAX_DAMAGE_INSTANCES) break;
    const dice = m[2].replace(/\s+/g, " ").trim();
    if (!HAS_DICE.test(dice)) continue;
    out.push({
      average: Number(m[1]),
      dice,
      type: damageTypeAfter(body, m.index + m[0].length),
    });
  }
  if (out.length > 0) return out;

  const flat = FLAT_DAMAGE.exec(body);
  if (flat) return [{ average: Number(flat[1]), dice: null, type: flat[2].toLowerCase() }];
  return [];
}

// How far past a dice group to look for its damage type. Long enough for
// "(2d6 + 5) Bludgeoning damage" plus 2024's occasional intervening words,
// short enough not to reach into the next sentence.
const TYPE_LOOKAHEAD = 48;

function damageTypeAfter(body: string, from: number): string | null {
  const tail = body.slice(from, from + TYPE_LOOKAHEAD);
  const nextGroup = tail.search(/\d+\s*\(/);
  const window = nextGroup === -1 ? tail : tail.slice(0, nextGroup);
  for (const word of window.toLowerCase().match(/[a-z]+/g) ?? []) {
    if (DAMAGE_TYPE_SET.has(word)) return word;
  }
  return null;
}

// ── Weapon matching ──────────────────────────────────────────────────────────

// Exact normalized name only. A monster action called "Longsword" IS a
// longsword; anything fuzzier would attach "Dagger of Venom" stats to a
// "Dagger" action, or claim a "Bite" is a weapon. Built lazily so importing
// this module for its types alone doesn't walk the dataset.
let weaponIndex: Map<string, Weapon> | null = null;

function weaponByName(key: string): Weapon | undefined {
  if (weaponIndex === null) {
    weaponIndex = new Map();
    for (const w of weaponsData) {
      const k = nameKey(w.name);
      if (!weaponIndex.has(k)) weaponIndex.set(k, w);
    }
  }
  return weaponIndex.get(key);
}

/** Strip a trailing qualifier — "Longsword (Two-Handed)", "Bite (Wolf Form)" —
 *  so the base name can be matched against the weapons dataset. */
function baseActionName(name: string): string {
  return nameKey(name.replace(/\s*\([^)]*\)\s*$/, ""));
}

function toWeaponRef(w: Weapon): WeaponRef {
  return {
    name: w.name,
    category: w.category,
    damage: w.damage,
    damageType: w.damage_type,
    properties: w.properties,
  };
}

// ── Spell name resolution ────────────────────────────────────────────────────

// A single alternation over all 557 bundled spell names, sorted LONGEST FIRST.
// Regex alternation is ordered, so at any given position the longest name wins
// — which is what keeps "lightning bolt" from being read as the spell "light",
// and "cure wounds" from matching before "mass cure wounds" has been tried.
// Built lazily and cached; the construction cost is paid once, by the first
// spellcasting monster the DM opens.
let spellPattern: RegExp | null = null;
let spellIndex: Map<string, Spell> | null = null;

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function ensureSpellIndex(): { pattern: RegExp; index: Map<string, Spell> } {
  if (spellPattern === null || spellIndex === null) {
    const index = new Map<string, Spell>();
    for (const s of spellData) {
      const k = nameKey(s.name);
      if (!index.has(k)) index.set(k, s);
    }
    const names = [...index.keys()].sort((a, b) => b.length - a.length);
    spellPattern = new RegExp(`\\b(${names.map(escapeRe).join("|")})\\b`, "gi");
    spellIndex = index;
  }
  return { pattern: spellPattern, index: spellIndex };
}

/**
 * Every bundled spell named in `text`, in order of appearance, deduplicated.
 *
 * Matching against the dataset rather than parsing the comma/newline grammar is
 * deliberate: the same "spell list" is written as ", "-separated in 2014 WotC
 * entries, "\n "-separated in some Open5e ones (the spirit naga's list reads
 * `command\n cure wounds\n false life`), and `_underscore_`-emphasized in the
 * 2024 entries. Scanning for known names is indifferent to all of it. The cost
 * is that a homebrew spell outside the 557 is not resolved — which is why the
 * UI renders the block's original text alongside the resolved chips.
 */
export function findSpellsInText(text: string): Spell[] {
  const { pattern, index } = ensureSpellIndex();
  const normalized = normalizeText(text);
  const seen = new Set<string>();
  const out: Spell[] = [];
  pattern.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(normalized)) !== null) {
    const key = nameKey(m[1]);
    if (seen.has(key)) continue;
    const spell = index.get(key);
    if (spell) {
      seen.add(key);
      out.push(spell);
    }
  }
  return out;
}

// ── Spellcasting blocks ──────────────────────────────────────────────────────

// Group headers, as they actually appear across the dataset (59 distinct forms):
// "At Will:", "Cantrips (at will):", "1st level (4 slots):", "1st-level
// (4 slots):", "3/day each:", "3/day ea:", "1/Day:", "2/day each:", "Cantrips:".
// "Constant:", "Rituals:" and the /week//month//year periods are emitted by
// `renderSpellcasting` in the monsters generator, which folds the 5etools
// `spellcasting` block into this same prose shape.
//
// Two branches, because the trailing colon is load-bearing for one and absent
// from the other:
//  1. A slot-count header ("3rd-level (3 slots)") is unambiguous on its own, and
//     some Open5e entries genuinely omit the colon — the Accursed Guardian Naga
//     writes "2nd-level (3 slots): ... 3rd-level (3 slots) clairvoyance", which
//     with a required colon silently folded its 3rd-level spells into the 2nd.
//  2. Everything else REQUIRES the colon, because "level" without a slot count
//     also appears in prose ("the naga is an 11th level spellcaster") and would
//     otherwise open a phantom group over the block's preamble.
const GROUP_HEADER =
  /(\d(?:st|nd|rd|th)[-\s]?level\s*\(\s*\d+\s*slots?\s*\))\s*:?|((?:cantrips?|at[- ]will|constant|rituals?|\d(?:st|nd|rd|th)[-\s]?level|\d\s*\/\s*(?:day|(?:short\s+|long\s+)?rest|week|month|year)(?:\s+(?:each|ea\.?))?)[^:\n]{0,40}?):/gi;

const SPELL_SAVE_DC = /(?:spell\s+)?save\s+DC\s*(\d+)/i;
const SPELL_ATTACK_BONUS = /([+-]\d+)\s+to\s+hit\s+with\s+spell\s+attacks/i;
const SPELL_ABILITY = new RegExp(
  String.raw`spellcasting\s+ability\s+is\s+(${ABILITIES.join("|")})`,
  "i",
);

/**
 * Title-case a parsed group header for display: "3/day ea" → "3/Day Each",
 * "1st-level (4 slots)" → "1st Level (4 Slots)".
 *
 * The hyphen normalization matters: the dataset writes the same slot level both
 * ways ("1st level (4 slots)" in 2014 WotC entries, "1st-level (4 slots)" in
 * Open5e ones), and a monster with both spellings would otherwise render two
 * headers that look like a data bug.
 */
function formatGroupLabel(raw: string): string {
  return raw
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\bea\.?\b/i, "each")
    .replace(/(\d(?:st|nd|rd|th))[-\s]*level/i, "$1 level")
    .replace(/[a-z]+/gi, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .replace(/(\d)(St|Nd|Rd|Th)\b/g, (_, d, s) => `${d}${s.toLowerCase()}`);
}

/**
 * Split a spellcasting body into its labelled groups.
 *
 * Text BEFORE the first header is skipped: it is the "The naga is an 11th level
 * spellcaster. Its spellcasting ability is Wisdom (spell save DC 16)" preamble,
 * which is prose and would feed the name scanner false positives. When there is
 * no header at all (14 entries, the "can innately cast suggestion" one-liner
 * form) the whole body is scanned as a single unlabelled group instead — that is
 * the only way those spells are recoverable.
 */
export function parseSpellGroups(desc: string): SpellGroup[] {
  const headers: { label: string; start: number; end: number }[] = [];
  GROUP_HEADER.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = GROUP_HEADER.exec(desc)) !== null) {
    // Group 1 is the colon-optional slot-count branch, group 2 the
    // colon-required one — exactly one of them matched.
    headers.push({
      label: formatGroupLabel(m[1] ?? m[2]),
      start: m.index,
      end: m.index + m[0].length,
    });
  }

  if (headers.length === 0) {
    const spells = findSpellsInText(desc);
    return spells.length > 0 ? [{ label: "Spells", spells }] : [];
  }

  const groups: SpellGroup[] = [];
  for (let i = 0; i < headers.length; i++) {
    const body = desc.slice(headers[i].end, headers[i + 1]?.start ?? desc.length);
    const spells = findSpellsInText(body);
    if (spells.length > 0) groups.push({ label: headers[i].label, spells });
  }
  return groups;
}

// Name-based, because that is what the dataset gives us to work with. Covers
// every variant present: "Spellcasting", "Innate Spellcasting", "Innate
// Spellcasting (3/Day)", "Runic Spellcasting", "Spellcasting (Psionics)" — plus
// the bare "Psionics" some 5etools blocks use as their block name.
function isSpellcastingTrait(t: MonsterTrait): boolean {
  return /spellcasting|psionics/i.test(t.name);
}

function toSpellcastingBlock(t: MonsterTrait, origin: OptionOrigin): SpellcastingBlock | null {
  const groups = parseSpellGroups(t.desc);
  const dc = SPELL_SAVE_DC.exec(t.desc);
  const bonus = SPELL_ATTACK_BONUS.exec(t.desc);
  const ability = SPELL_ABILITY.exec(t.desc);
  // A "Spellcasting"-named trait that names no spells AND states no DC is not a
  // spell list — e.g. the Alehouse Drake's "Forgetful Spellcasting", which
  // describes what happens to creatures that fail a save against its spells.
  // Listing it under Spells would be noise.
  if (groups.length === 0 && dc === null) return null;
  return {
    name: t.name,
    origin,
    ability: ability ? titleCaseAbility(ability[1]) : null,
    saveDc: dc ? Number(dc[1]) : null,
    attackBonus: bonus ? Number(bonus[1]) : null,
    groups,
    desc: t.desc,
  };
}

// ── Attack / save-action extraction ──────────────────────────────────────────

function toAttack(t: MonsterTrait, origin: OptionOrigin): MonsterAttack | null {
  const m = ATTACK_LINE.exec(t.desc);
  if (!m) return null;
  const kind: AttackKind =
    m[1].toLowerCase() === "melee or ranged"
      ? "melee-or-ranged"
      : (m[1].toLowerCase() as "melee" | "ranged");
  const tail = t.desc.slice(m.index + m[0].length);

  const reachMatch = REACH.exec(tail);
  const rangeMatch = RANGE.exec(tail);
  let reach = reachMatch ? `${reachMatch[1]} ft.` : null;
  const range = rangeMatch ? `${rangeMatch[1]} ft.` : null;
  if (reach === null && range === null && kind !== "ranged") {
    const bare = BARE_REACH.exec(tail);
    if (bare) reach = `${bare[1]} ft.`;
  }

  const weapon = weaponByName(baseActionName(t.name));
  return {
    name: t.name,
    origin,
    kind,
    isSpellAttack: (m[2] ?? "").toLowerCase().startsWith("spell"),
    toHit: Number(m[3]),
    reach,
    range,
    damage: parseDamage(tail),
    save: parseSave(tail),
    weapon: weapon ? toWeaponRef(weapon) : null,
  desc: t.desc,
  };
}

function toSaveAction(t: MonsterTrait, origin: OptionOrigin): MonsterSaveAction | null {
  const save = parseSave(t.desc);
  if (!save) return null;
  return { name: t.name, origin, save, damage: parseDamage(t.desc), desc: t.desc };
}

const MULTIATTACK = /^multiattack\b/i;

/**
 * Derive every offensive option a stat block describes.
 *
 * Section handling:
 *  - `actions` / `legendaryActions` / `reactions` are scanned for attack rolls
 *    first; anything with no attack roll but a save DC becomes a save action
 *    (breath weapons, gaze attacks, Frightful Presence). An entry with neither
 *    is left out — it is still visible in the Bestiary's existing Actions tab,
 *    so nothing is hidden, it just isn't claimed to be an attack.
 *  - `traits` contribute spellcasting only. Traits describe passive properties;
 *    the handful that carry an attack line ("...can make one bite attack as...")
 *    describe when an existing action may be used, not a separate one.
 *
 * Spellcasting is read from BOTH traits and actions: 2014 stat blocks put it in
 * traits, 2024 ones make it an action.
 */
export function deriveCombatOptions(m: StatblockSections): CombatOptions {
  const attacks: MonsterAttack[] = [];
  const saveActions: MonsterSaveAction[] = [];
  const spellcasting: SpellcastingBlock[] = [];
  let multiattack: string | null = null;

  const sections: [OptionOrigin, MonsterTrait[] | undefined][] = [
    ["action", m.actions],
    ["legendary", m.legendaryActions],
    ["reaction", m.reactions],
  ];

  for (const [origin, entries] of sections) {
    for (const t of entries ?? []) {
      if (isSpellcastingTrait(t)) {
        const block = toSpellcastingBlock(t, origin);
        if (block) spellcasting.push(block);
        continue;
      }
      if (origin === "action" && MULTIATTACK.test(t.name)) {
        multiattack = t.desc;
        continue;
      }
      const attack = toAttack(t, origin);
      if (attack) {
        attacks.push(attack);
        continue;
      }
      const saveAction = toSaveAction(t, origin);
      if (saveAction) saveActions.push(saveAction);
    }
  }

  for (const t of m.traits ?? []) {
    if (!isSpellcastingTrait(t)) continue;
    const block = toSpellcastingBlock(t, "trait");
    if (block) spellcasting.push(block);
  }

  const spellCount = spellcasting.reduce(
    (n, b) => n + b.groups.reduce((g, group) => g + group.spells.length, 0),
    0,
  );

  return { attacks, saveActions, spellcasting, multiattack, spellCount };
}

// ── Display helpers ──────────────────────────────────────────────────────────

/** "5 ft." / "80/320 ft." / "5 ft. or 20/60 ft." — the distance column. */
export function formatDistance(a: MonsterAttack): string | null {
  if (a.reach && a.range) return `${a.reach} or ${a.range}`;
  return a.reach ?? a.range ?? null;
}

/** "12 (2d6 + 5) piercing + 4 (1d8) acid" — the damage column. Falls back to
 *  the dice or the average alone when the source gave only one of them. */
export function formatDamage(damage: DamageInstance[]): string {
  return damage
    .map((d) => {
      const amount =
        d.average !== null && d.dice !== null
          ? `${d.average} (${d.dice})`
          : d.dice ?? (d.average !== null ? String(d.average) : "");
      return d.type ? `${amount} ${d.type}` : amount;
    })
    .filter((s) => s !== "")
    .join(" + ");
}

/** Signed to-hit for display: 9 → "+9", -1 → "-1". */
export function formatToHit(toHit: number): string {
  return toHit >= 0 ? `+${toHit}` : String(toHit);
}
