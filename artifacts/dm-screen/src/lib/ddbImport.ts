// D&D Beyond character import for the Party widget.
//
// D&D Beyond exposes a *public* character's full sheet as JSON at
//   https://character-service.dndbeyond.com/character/v5/character/<id>
// (the same document their own sheet renders from). This module turns that
// document into the Party widget's `PlayerCharacter` fields so the DM can
// paste a character link instead of retyping name / race / class / level /
// AC / HP / weapons / spells.
//
// Two ingestion paths share one parser:
//   1. `fetchDdbCharacter(id)` — a direct browser fetch. Works when the
//      character's privacy is "Public" and the browser lets the cross-origin
//      request through.
//   2. `parseDdbCharacterJson(text)` — the DM opens the JSON URL in a tab,
//      copies it (or saves it) and pastes / uploads it. Always works, even
//      when (1) is blocked by CORS, a network policy, or an offline DM.
//
// The JSON does NOT carry a computed AC or max HP — D&D Beyond derives both
// client-side from base values + equipment + modifiers. `computeArmorClass` /
// `computeMaxHp` re-derive them with the common rules (armor type + DEX cap,
// shields, Unarmored Defense, item/feat bonuses, the sheet's manual
// overrides). Exotic features can still be missed, which is why the widget
// prefills its editable form for review rather than saving straight away.
//
// Everything here is defensive about shape: the document is external input,
// so every field is read through narrow `unknown` guards and a missing or
// odd field degrades to "unknown" rather than throwing.

import type { PlayerCharacter } from "@/types";

/** Origin of the D&D Beyond character service. The Docker CSP `connect-src`
 *  (docker/security-headers.conf) must list it — cspConfigSync.test.ts
 *  enforces that coupling. */
export const DDB_CHARACTER_SERVICE_ORIGIN = "https://character-service.dndbeyond.com";

/** Raw-text cap, checked before JSON.parse. A heavily-equipped character is
 *  ~1–2 MB of JSON; this leaves headroom while still refusing a file that
 *  would hang the tab. */
export const MAX_DDB_JSON_CHARS = 10_000_000;

/** Mirrors partyStore's per-PC list ceiling (PC_MAX_LIST). */
const MAX_LIST = 100;

const LEVEL_MAX = 20;

export type DdbCharacterInput = Omit<PlayerCharacter, "id">;

export interface DdbImportResult {
  character: DdbCharacterInput;
  /** D&D Beyond character id, when the document carries one. */
  ddbId: number | null;
  /** Human-readable notes about things the import approximated or dropped. */
  warnings: string[];
}

// ── Id / URL helpers ─────────────────────────────────────────────────────

/** Accepts a bare numeric id or any D&D Beyond character URL —
 *  `dndbeyond.com/characters/123`, `…/profile/<user>/characters/123`,
 *  share links with a trailing slug, or the character-service JSON URL
 *  itself — and returns the numeric id as a string, or null. */
export function parseDdbCharacterId(input: string): string | null {
  const s = input.trim();
  if (!s) return null;
  if (/^\d{1,12}$/.test(s)) return s;
  const m = s.match(/dndbeyond\.com\/(?:[^\s?#]*\/)?characters?\/(\d{1,12})(?=$|[/?#\s])/i);
  return m ? m[1] : null;
}

/** A pasted D&D Beyond link → a safe https URL on dndbeyond.com, or null.
 *  Accepts a full URL, one missing its scheme ("dndbeyond.com/characters/1"),
 *  or a bare character id. Anything off D&D Beyond (or a `javascript:` URL
 *  from a hand-edited party file) is rejected, since it's rendered as a
 *  clickable link. */
export function normalizeDdbUrl(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const s = input.trim();
  if (!s || s.length > 500) return null;
  if (/^\d{1,12}$/.test(s)) return `https://www.dndbeyond.com/characters/${s}`;
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(s) ? s : `https://${s}`);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const host = url.hostname.toLowerCase();
  if (host !== "dndbeyond.com" && !host.endsWith(".dndbeyond.com")) return null;
  if (url.username || url.password) return null;
  url.protocol = "https:";
  return url.toString();
}

/** The D&D Beyond sheet URL for a character id. */
export function ddbCharacterSheetUrl(id: string | number): string {
  return `https://www.dndbeyond.com/characters/${id}`;
}

export function ddbCharacterJsonUrl(id: string): string {
  return `${DDB_CHARACTER_SERVICE_ORIGIN}/character/v5/character/${encodeURIComponent(id)}`;
}

// ── Narrow readers for untrusted JSON ────────────────────────────────────

type Obj = Record<string, unknown>;

function isObj(x: unknown): x is Obj {
  return x !== null && typeof x === "object" && !Array.isArray(x);
}

function arr(x: unknown): unknown[] {
  return Array.isArray(x) ? x : [];
}

function objs(x: unknown): Obj[] {
  return arr(x).filter(isObj);
}

function num(x: unknown): number | null {
  return typeof x === "number" && Number.isFinite(x) ? x : null;
}

function str(x: unknown): string | null {
  return typeof x === "string" && x.trim() ? x.trim() : null;
}

// ── Locating the character in the document ───────────────────────────────

/** The v5 service wraps the sheet as `{ success, message, data: {...} }`;
 *  older `/character/<id>/json` exports are the bare sheet. Accept both. */
export function extractDdbCharacter(doc: unknown): Obj {
  if (!isObj(doc)) {
    throw new Error("This doesn't look like a D&D Beyond character (expected a JSON object).");
  }
  if (doc.success === false) {
    const msg = str(doc.message);
    throw new Error(
      "D&D Beyond refused to share this character" +
        (msg ? ` ("${msg}")` : "") +
        ". Make sure its privacy is set to Public.",
    );
  }
  const candidate = isObj(doc.data) ? doc.data : doc;
  if (!str(candidate.name) || !Array.isArray(candidate.classes)) {
    throw new Error(
      "This doesn't look like a D&D Beyond character export (no name or classes found).",
    );
  }
  return candidate;
}

// ── Ability scores & modifiers ───────────────────────────────────────────

const STAT_SLUGS: Record<number, string> = {
  1: "strength",
  2: "dexterity",
  3: "constitution",
  4: "intelligence",
  5: "wisdom",
  6: "charisma",
};
const DEX = 2;
const CON = 3;

/** `stats` / `bonusStats` / `overrideStats` are arrays of `{ id, value }`. */
function statValue(list: unknown, statId: number): number | null {
  for (const s of objs(list)) {
    if (s.id === statId) return num(s.value);
  }
  return null;
}

/** Equipped (and, where required, attuned) inventory entries — the only items
 *  whose modifiers and armor actually apply. */
function activeItems(c: Obj): Obj[] {
  return objs(c.inventory).filter((it) => {
    if (it.equipped !== true) return false;
    const def = isObj(it.definition) ? it.definition : {};
    return def.canAttune !== true || it.isAttuned === true;
  });
}

/** Every modifier currently in force. `modifiers` is keyed by source
 *  (race / class / background / feat / item / condition); item modifiers
 *  only count for active items (D&D Beyond lists them for the whole pack),
 *  and condition modifiers are situational, so they're skipped. */
function activeModifiers(c: Obj): Obj[] {
  const mods = isObj(c.modifiers) ? c.modifiers : {};
  const out: Obj[] = [];
  for (const key of ["race", "class", "background", "feat"]) {
    out.push(...objs(mods[key]));
  }
  const active = new Set<unknown>();
  for (const it of activeItems(c)) {
    if (isObj(it.definition) && it.definition.id != null) active.add(it.definition.id);
    if (it.id != null) active.add(it.id);
  }
  for (const m of objs(mods.item)) {
    if (active.has(m.componentId)) out.push(m);
  }
  return out;
}

function sumBonus(mods: Obj[], subType: string): number {
  let total = 0;
  for (const m of mods) {
    if (m.type === "bonus" && m.subType === subType) total += num(m.value) ?? 0;
  }
  return total;
}

export function abilityScore(c: Obj, mods: Obj[], statId: number): number {
  const override = statValue(c.overrideStats, statId);
  if (override != null) return override;
  const slug = `${STAT_SLUGS[statId]}-score`;
  let score = (statValue(c.stats, statId) ?? 10) + (statValue(c.bonusStats, statId) ?? 0);
  score += sumBonus(mods, slug);
  // "set" modifiers (Amulet of Health, Belt of Giant Strength…) raise the
  // score to a floor; they never lower it.
  for (const m of mods) {
    if (m.type === "set" && m.subType === slug) {
      const v = num(m.value);
      if (v != null && v > score) score = v;
    }
  }
  return score;
}

const abilityMod = (score: number) => Math.floor((score - 10) / 2);

// ── Level / HP / AC ──────────────────────────────────────────────────────

function totalLevel(c: Obj): number {
  let lvl = 0;
  for (const cl of objs(c.classes)) lvl += num(cl.level) ?? 0;
  return Math.max(1, Math.min(LEVEL_MAX, Math.trunc(lvl) || 1));
}

/** Max HP = the sheet's override if set, else rolled/fixed base + bonus +
 *  CON mod per level + per-level bonuses (Tough, Dwarven Toughness…). */
export function computeMaxHp(c: Obj, mods: Obj[] = activeModifiers(c)): number | null {
  const override = num(c.overrideHitPoints);
  if (override != null) return Math.max(0, Math.trunc(override));
  const base = num(c.baseHitPoints);
  if (base == null) return null;
  const level = totalLevel(c);
  const conMod = abilityMod(abilityScore(c, mods, CON));
  const hp =
    base +
    (num(c.bonusHitPoints) ?? 0) +
    conMod * level +
    sumBonus(mods, "hit-points-per-level") * level +
    sumBonus(mods, "hit-points");
  return Math.max(1, Math.trunc(hp));
}

// armorTypeId: 1 light, 2 medium, 3 heavy, 4 shield.
function armorType(def: Obj): number | null {
  const id = num(def.armorTypeId);
  if (id != null) return id;
  const t = (str(def.type) ?? "").toLowerCase();
  if (t.startsWith("light")) return 1;
  if (t.startsWith("medium")) return 2;
  if (t.startsWith("heavy")) return 3;
  if (t === "shield") return 4;
  return null;
}

/** characterValues typeIds for the sheet's "Armor Class" customization panel. */
const CV_AC_OVERRIDE = 1;
const CV_AC_MAGIC_BONUS = 2;
const CV_AC_MISC_BONUS = 3;

function characterValue(c: Obj, typeId: number): number | null {
  for (const v of objs(c.characterValues)) {
    if (v.typeId === typeId) {
      const n = num(v.value);
      if (n != null) return n;
    }
  }
  return null;
}

export function computeArmorClass(c: Obj, mods: Obj[] = activeModifiers(c)): number {
  const override = characterValue(c, CV_AC_OVERRIDE);
  if (override != null) return Math.max(0, Math.trunc(override));

  const dexMod = abilityMod(abilityScore(c, mods, DEX));
  let armor: Obj | null = null;
  let shield: Obj | null = null;
  for (const it of activeItems(c)) {
    const def = isObj(it.definition) ? it.definition : null;
    if (!def) continue;
    const kind = armorType(def);
    if (kind === 4) {
      if (!shield || (num(def.armorClass) ?? 0) > (num(shield.armorClass) ?? 0)) shield = def;
    } else if (kind === 1 || kind === 2 || kind === 3) {
      if (!armor || (num(def.armorClass) ?? 0) > (num(armor.armorClass) ?? 0)) armor = def;
    }
  }

  let ac: number;
  if (armor) {
    const kind = armorType(armor);
    const dexPart = kind === 1 ? dexMod : kind === 2 ? Math.min(dexMod, 2) : 0;
    ac = (num(armor.armorClass) ?? 10) + dexPart;
    ac += sumBonus(mods, "armored-armor-class");
  } else {
    ac = 10 + dexMod;
    // Unarmored Defense (Barbarian → CON, Monk → WIS) carries the extra
    // ability as `statId`; Draconic Resilience-style features carry a flat
    // `value`. Take the best option, as D&D Beyond does.
    for (const m of mods) {
      if (m.type === "set" && m.subType === "unarmored-armor-class") {
        const statId = num(m.statId);
        const extra = statId != null && STAT_SLUGS[statId]
          ? abilityMod(abilityScore(c, mods, statId))
          : 0;
        ac = Math.max(ac, 10 + dexMod + extra + (num(m.value) ?? 0));
      }
    }
    ac += sumBonus(mods, "unarmored-armor-class");
  }
  if (shield) ac += num(shield.armorClass) ?? 2;
  ac += sumBonus(mods, "armor-class");
  ac += characterValue(c, CV_AC_MAGIC_BONUS) ?? 0;
  ac += characterValue(c, CV_AC_MISC_BONUS) ?? 0;
  return Math.max(0, Math.trunc(ac));
}

// ── Race / class ─────────────────────────────────────────────────────────

function raceName(c: Obj): string | null {
  const r = isObj(c.race) ? c.race : null;
  if (!r) return null;
  return str(r.fullName) ?? str(r.baseName) ?? str(r.baseRaceName);
}

/** "Wizard" for a single class; "Fighter 3 / Wizard 2" for a multiclass,
 *  starting class first. */
function className(c: Obj): string | null {
  const classes = objs(c.classes)
    .map((cl) => ({
      name: isObj(cl.definition) ? str(cl.definition.name) : null,
      level: num(cl.level) ?? 0,
      starting: cl.isStartingClass === true,
    }))
    .filter((x): x is { name: string; level: number; starting: boolean } => x.name != null);
  if (classes.length === 0) return null;
  if (classes.length === 1) return classes[0].name;
  classes.sort((a, b) => Number(b.starting) - Number(a.starting) || b.level - a.level);
  return classes.map((x) => `${x.name} ${x.level}`).join(" / ");
}

// ── Weapons / spells ─────────────────────────────────────────────────────

function dedupe(names: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const n of names) {
    const k = n.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(n);
  }
  return out;
}

/** Equipped weapons; if nothing is marked equipped, every weapon carried. */
function weaponNames(c: Obj): string[] {
  const weapons = objs(c.inventory).filter(
    (it) => isObj(it.definition) && it.definition.filterType === "Weapon",
  );
  const equipped = weapons.filter((it) => it.equipped === true);
  const pool = equipped.length > 0 ? equipped : weapons;
  return dedupe(
    pool
      .map((it) => (isObj(it.definition) ? str(it.definition.name) : null))
      .filter((n): n is string => n != null),
  );
}

interface SpellRef {
  name: string;
  level: number;
}

function spellRef(entry: Obj): SpellRef | null {
  const def = isObj(entry.definition) ? entry.definition : null;
  const name = def ? str(def.name) : null;
  if (!def || !name) return null;
  return { name, level: num(def.level) ?? 0 };
}

interface SpellListing extends SpellRef {
  prepared: boolean;
}

/** Every spell the character knows, each flagged prepared or not.
 *  Per class list, a "prepare" caster (any spell flagged `prepared`, e.g. a
 *  Wizard and their spellbook) has only its prepared / always-prepared spells
 *  and cantrips marked prepared; a "known" caster (nothing flagged) has all
 *  of them prepared. Race / class-feature / feat / background spells are
 *  always prepared. Item spells are skipped (they depend on charges and
 *  attunement). Sorted cantrips-first, then by name. */
function spellListings(c: Obj): SpellListing[] {
  const out: SpellListing[] = [];
  for (const cs of objs(c.classSpells)) {
    const list = objs(cs.spells);
    const preparesSpells = list.some((s) => s.prepared === true);
    for (const s of list) {
      const ref = spellRef(s);
      if (!ref) continue;
      out.push({
        ...ref,
        prepared:
          !preparesSpells ||
          ref.level === 0 ||
          s.prepared === true ||
          s.alwaysPrepared === true,
      });
    }
  }
  const granted = isObj(c.spells) ? c.spells : {};
  for (const key of ["race", "class", "feat", "background"]) {
    for (const s of objs(granted[key])) {
      const ref = spellRef(s);
      if (ref) out.push({ ...ref, prepared: true });
    }
  }
  // Merge duplicates (the same spell from two sources): prepared if any
  // source has it prepared.
  const byName = new Map<string, SpellListing>();
  for (const l of out) {
    const k = l.name.toLowerCase();
    const cur = byName.get(k);
    if (!cur) byName.set(k, { ...l });
    else cur.prepared ||= l.prepared;
  }
  return [...byName.values()].sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
}

// ── Public entry points ──────────────────────────────────────────────────

/** Convert an already-parsed D&D Beyond document into Party fields. */
export function ddbCharacterToPlayer(doc: unknown): DdbImportResult {
  const c = extractDdbCharacter(doc);
  const warnings: string[] = [];
  const mods = activeModifiers(c);

  let weapons = weaponNames(c);
  if (weapons.length > MAX_LIST) {
    warnings.push(`Only the first ${MAX_LIST} of ${weapons.length} weapons were kept.`);
    weapons = weapons.slice(0, MAX_LIST);
  }
  let listings = spellListings(c);
  if (listings.length > MAX_LIST) {
    warnings.push(`Only ${MAX_LIST} of ${listings.length} spells were kept (prepared spells first).`);
    // Keep every prepared spell before any known-only one, then restore order.
    const order = new Map(listings.map((l, i) => [l, i]));
    listings = [...listings.filter((l) => l.prepared), ...listings.filter((l) => !l.prepared)]
      .slice(0, MAX_LIST)
      .sort((a, b) => order.get(a)! - order.get(b)!);
  }
  const spells = listings.map((l) => l.name);
  const prepared = listings.filter((l) => l.prepared).map((l) => l.name);

  const hp = computeMaxHp(c, mods);
  if (hp == null) warnings.push("Max HP couldn't be determined — fill it in by hand.");

  const rawLevel = objs(c.classes).reduce((t, cl) => t + (num(cl.level) ?? 0), 0);
  if (rawLevel > LEVEL_MAX) warnings.push(`Level ${rawLevel} was capped at ${LEVEL_MAX}.`);

  return {
    character: {
      name: str(c.name) ?? "",
      race: raceName(c),
      class: className(c),
      level: totalLevel(c),
      ac: computeArmorClass(c, mods),
      hp,
      spells,
      prepared,
      abilities: {
        str: abilityScore(c, mods, 1),
        dex: abilityScore(c, mods, 2),
        con: abilityScore(c, mods, 3),
        int: abilityScore(c, mods, 4),
        wis: abilityScore(c, mods, 5),
        cha: abilityScore(c, mods, 6),
      },
      weapons,
    },
    ddbId: num(c.id),
    warnings,
  };
}

/** Parse pasted / uploaded D&D Beyond JSON text. Throws a DM-readable Error. */
export function parseDdbCharacterJson(text: string): DdbImportResult {
  if (text.length > MAX_DDB_JSON_CHARS) {
    throw new Error(
      `That's too large to be a D&D Beyond character ` +
        `(${(text.length / 1_000_000).toFixed(1)} MB; max ${MAX_DDB_JSON_CHARS / 1_000_000} MB).`,
    );
  }
  const trimmed = text.trim();
  if (!trimmed) throw new Error("Paste the character JSON first.");
  let doc: unknown;
  try {
    doc = JSON.parse(trimmed);
  } catch {
    throw new Error(
      "That isn't valid JSON. Copy the whole page from the character JSON link (Ctrl+A, Ctrl+C) and paste it again.",
    );
  }
  return ddbCharacterToPlayer(doc);
}

/** Thrown by `fetchDdbCharacter` when the direct fetch can't complete; the
 *  widget responds by offering the paste-the-JSON fallback. */
export class DdbFetchError extends Error {
  constructor(
    message: string,
    readonly kind: "network" | "private" | "http",
  ) {
    super(message);
    this.name = "DdbFetchError";
  }
}

/** Fetch a public character straight from D&D Beyond. Rejects with a
 *  `DdbFetchError` on network/CORS/privacy failures, an `AbortError` if
 *  `signal` fires, or a plain Error if the response isn't a character. */
export async function fetchDdbCharacter(
  id: string,
  opts: { signal?: AbortSignal; fetchImpl?: typeof fetch } = {},
): Promise<DdbImportResult> {
  const doFetch = opts.fetchImpl ?? fetch;
  let res: Response;
  try {
    // No custom headers and no credentials: keeps this a CORS "simple"
    // request (no preflight) and never sends the DM's D&D Beyond cookies.
    res = await doFetch(ddbCharacterJsonUrl(id), {
      signal: opts.signal,
      credentials: "omit",
    });
  } catch (e) {
    if ((e as { name?: string })?.name === "AbortError") throw e;
    throw new DdbFetchError(
      "Couldn't reach D&D Beyond from the browser (it may be blocking the request, or you're offline).",
      "network",
    );
  }
  if (res.status === 401 || res.status === 403 || res.status === 404) {
    throw new DdbFetchError(
      "D&D Beyond wouldn't share that character. Check the link, and set the character's privacy to Public.",
      "private",
    );
  }
  if (!res.ok) {
    throw new DdbFetchError(`D&D Beyond returned an error (HTTP ${res.status}).`, "http");
  }
  return parseDdbCharacterJson(await res.text());
}
