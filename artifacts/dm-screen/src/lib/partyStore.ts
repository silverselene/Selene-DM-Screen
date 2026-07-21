// Shared party roster persistence. The Party widget owns CRUD; the Initiative
// widget reads it so "add party member to initiative" works without a server.
//
// Storage: a single versioned localStorage key (dm-party-v1). Cross-widget
// sync within the same tab is done via a `dm-party-changed` CustomEvent the
// store dispatches on every mutation — the storage event alone doesn't fire
// for same-tab writes.

import { useEffect, useState } from "react";

import type { PlayerCharacter } from "@/types";
import { parseEnvelopeHead } from "@/lib/envelope";

const STORAGE_KEY = "dm-party-v1";
const CHANGED_EVENT = "dm-party-changed";

function readRaw(): PlayerCharacter[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return normalizePartyBatch(parsed);
  } catch {
    return [];
  }
}

// Module-level monotonic counter for minted PC ids. Lazily seeded from
// Date.now() so minted ids are roughly wall-clock-ordered, but always
// post-increments — so synchronous batches (e.g. `arr.map(normalize)` on
// an import where every record is missing `id`) never collide. Every
// observed existing id also bumps the counter via `bumpIdCounter` so a
// subsequent mint can't accidentally land on it.
let idCounter = 0;

function bumpIdCounter(seen: number): void {
  if (seen > idCounter) idCounter = seen;
}

function mintId(): number {
  const now = Date.now();
  if (now > idCounter) idCounter = now;
  return ++idCounter;
}

// Accepted range for an existing (stored / imported) PC id. Legitimate ids
// are minted from the Date.now()-seeded counter above, so they're always
// positive safe integers; the explicit ceiling keeps a hostile import from
// bumping the counter anywhere near 2^53, where `++idCounter` becomes a
// float no-op and every subsequent mint would return the same id forever
// (permanent duplicate-id corruption — updateCharacter/deleteCharacter
// match on `c.id`, so they'd hit multiple PCs). 2^50 leaves the mint
// counter ~9e15 − 1.1e15 of increment headroom, and Date.now() doesn't
// cross it until the year ~37,600. Anything outside the range is re-minted,
// same as a missing id.
const PC_ID_MAX = 2 ** 50;

function isAcceptableId(v: unknown): v is number {
  return (
    typeof v === "number" &&
    Number.isSafeInteger(v) &&
    v > 0 &&
    v <= PC_ID_MAX
  );
}

// String + numeric caps for PC fields. Defends a one-click party import
// from a malformed file that would otherwise plant NaN into HP / AC math
// or 5MB strings into a name. The values are deliberately generous (a
// 200-char name still renders, level/AC/HP ceilings cover any homebrew
// the DM is likely to throw at it).
//
// NOTE: clamping runs on EVERY read via `readRaw` → `normalize`. An
// existing stored value outside these bounds (e.g. a DevTools-edited
// `level: 35`) is silently coerced on the next read and persisted in
// clamped form on the next write. Realistic D&D 5e values stay in
// range, so the only practical victim is hand-edited / homebrew data
// outside the listed ceilings — which we accept as the trade-off for a
// hard NaN/quota defense on the import path.
const PC_MAX_STRING = 200;
const PC_LEVEL_MIN = 1;
const PC_LEVEL_MAX = 30;
const PC_AC_MAX = 99;
const PC_HP_MAX = 9999;
// Per-PC spells/weapons list ceiling. `filterStrings` caps each entry at
// PC_MAX_STRING but previously not the entry COUNT, so a hostile party
// file could smuggle millions of tags through the import paths.
const PC_MAX_LIST = 100;

// Roster ceiling. Defined here (not backup.ts, which re-exports it) so the
// store's own write path can refuse at the same cap the backup importer's
// `validateParty` truncates to — otherwise a 51st live add would survive
// normal reads but silently vanish on the next full-backup round trip.
export const MAX_PARTY = 50;

// Raw-file cap for the party import, checked BEFORE JSON.parse: a
// multi-hundred-MB file would otherwise hang or OOM the tab during
// parse+normalize, long before any confirm dialog appears. Matches the
// full-backup importer's raw-value cap; ~40× a realistic 50-PC roster.
const MAX_IMPORT_FILE_CHARS = 2_000_000;

function clampString(v: unknown, max: number): string {
  return typeof v === "string" ? v.slice(0, max) : "";
}

function nullableString(v: unknown, max: number): string | null {
  return typeof v === "string" ? v.slice(0, max) : null;
}

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  if (typeof v !== "number" || !Number.isFinite(v)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(v)));
}

function nullableNonNegInt(v: unknown, max: number): number | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  const n = Math.trunc(v);
  if (n < 0) return null;
  return Math.min(n, max);
}

function filterStrings(arr: unknown[]): string[] {
  return arr
    .filter(isString)
    .slice(0, PC_MAX_LIST)
    .map((s) => s.slice(0, PC_MAX_STRING));
}

function normalize(c: unknown): PlayerCharacter {
  const obj = c as Partial<PlayerCharacter>;
  const hasValidId = isAcceptableId(obj.id);
  if (hasValidId) bumpIdCounter(obj.id as number);
  return {
    id: hasValidId ? (obj.id as number) : mintId(),
    name: clampString(obj.name, PC_MAX_STRING),
    race: nullableString(obj.race, PC_MAX_STRING),
    class: nullableString(obj.class, PC_MAX_STRING),
    level: clampInt(obj.level, PC_LEVEL_MIN, PC_LEVEL_MAX, PC_LEVEL_MIN),
    ac: nullableNonNegInt(obj.ac, PC_AC_MAX),
    hp: nullableNonNegInt(obj.hp, PC_HP_MAX),
    spells: Array.isArray(obj.spells) ? filterStrings(obj.spells) : [],
    weapons: Array.isArray(obj.weapons) ? filterStrings(obj.weapons) : [],
  };
}

function isPlainObject(x: unknown): x is Record<string, unknown> {
  return x !== null && typeof x === "object" && !Array.isArray(x);
}

/** Normalize a batch of PlayerCharacters with id-uniqueness guarantees.
 *  Used by every code path that ingests external data (storage reads,
 *  party-only imports, full-backup restores). Closes three failure modes:
 *  (1) non-object array elements (e.g. `["A","B"]`) are dropped outright
 *  rather than coerced into synthetic empty PCs that pollute the roster;
 *  (2) per-element `normalize()` minting via the monotonic `mintId`
 *  counter so missing ids in the batch get distinct values even when
 *  `.map`'d synchronously; (3) a post-pass that detects explicit duplicate
 *  ids in the input and renumbers the collisions. */
export function normalizePartyBatch(arr: unknown[]): PlayerCharacter[] {
  const normalized = arr.filter(isPlainObject).map(normalize);
  // Fast path: no duplicates → return as-is (common case for legitimate
  // storage reads, where every id is already distinct).
  const seen = new Set<number>();
  let hasDups = false;
  for (const pc of normalized) {
    if (seen.has(pc.id)) {
      hasDups = true;
      break;
    }
    seen.add(pc.id);
  }
  if (!hasDups) return normalized;
  // Renumber duplicates. The counter has already been bumped past every
  // observed acceptable id (by `normalize`/`bumpIdCounter`), so freshly
  // minted ids are expected to clear anything in the batch — but retry on
  // a collision anyway (mirrors `validateCombatants`' dedupe pass) so the
  // uniqueness guarantee never rests on that reasoning alone. The loop
  // terminates because `isAcceptableId` bounds the counter at PC_ID_MAX,
  // far below float saturation, so every mint is a genuine increment.
  seen.clear();
  return normalized.map((pc) => {
    if (seen.has(pc.id)) {
      let fresh = mintId();
      while (seen.has(fresh)) fresh = mintId();
      seen.add(fresh);
      return { ...pc, id: fresh };
    }
    seen.add(pc.id);
    return pc;
  });
}

function isString(x: unknown): x is string {
  return typeof x === "string";
}

function write(next: PlayerCharacter[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch (err) {
    // Quota / private mode. Surface to the console AND throw so callers
    // (addCharacter, updateCharacter, deleteCharacter, the import commit)
    // don't return success-shaped values for writes that didn't persist —
    // PartyWidget would otherwise alert "Imported N characters" on an
    // unpersisted import. Skip the cross-widget dispatch since other
    // widgets must stay aligned with what's actually in storage.
    console.error("partyStore.write: failed to persist party", err);
    throw err instanceof Error
      ? err
      : new Error("Failed to persist party to localStorage.");
  }
  window.dispatchEvent(new CustomEvent(CHANGED_EVENT));
}

export function loadParty(): PlayerCharacter[] {
  return readRaw();
}

export function addCharacter(
  input: Omit<PlayerCharacter, "id">,
): PlayerCharacter {
  const list = readRaw();
  if (list.length >= MAX_PARTY) {
    // Refuse rather than allow a roster the backup importer's
    // `validateParty` would silently truncate on the next restore.
    throw new Error(
      `The party is full (max ${MAX_PARTY} characters). Remove one first.`,
    );
  }
  const id = nextId(list);
  const created: PlayerCharacter = { ...input, id };
  write([...list, created]);
  return created;
}

export function updateCharacter(
  id: number,
  patch: Omit<PlayerCharacter, "id">,
): PlayerCharacter | null {
  const list = readRaw();
  let updated: PlayerCharacter | null = null;
  const next = list.map((c) => {
    if (c.id !== id) return c;
    updated = { ...patch, id };
    return updated;
  });
  if (!updated) return null;
  write(next);
  return updated;
}

export function deleteCharacter(id: number): void {
  const list = readRaw();
  const next = list.filter((c) => c.id !== id);
  if (next.length === list.length) return;
  write(next);
}

// ── JSON export / import (Party only) ────────────────────────────────────
// Self-contained envelope so an imported file has provenance + a version we
// can branch on later if the PlayerCharacter shape evolves.
interface PartyExportEnvelope {
  schema: "selene-dm-party";
  version: 1;
  exportedAt: string;
  party: PlayerCharacter[];
}

export function exportPartyAsJson(): string {
  const env: PartyExportEnvelope = {
    schema: "selene-dm-party",
    version: 1,
    exportedAt: new Date().toISOString(),
    party: readRaw(),
  };
  return JSON.stringify(env, null, 2);
}

export interface PartyImportSummary {
  /** How many valid PCs the file will write. */
  accepted: number;
  /** How many PCs are currently in the roster (will be replaced). */
  currentCount: number;
  /** PCs in the file beyond MAX_PARTY that the import will drop. Surfaced
   *  so the confirm dialog can warn instead of truncating silently. */
  dropped: number;
  /** envelope.exportedAt, if present. */
  exportedAt?: string;
}

export interface PreparedPartyImport {
  summary: PartyImportSummary;
  /** Replace the roster with the validated batch. Returns the written
   *  count. Throws only on quota / storage failure. */
  commit: () => number;
}

/** Two-phase party import: parse + validate now, commit after the user
 *  confirms. Throws on a malformed envelope; the caller renders the
 *  message. The summary lets the caller show "Replace your N characters
 *  with M imported characters?" instead of a count-blind prompt. */
export function preparePartyImport(text: string): PreparedPartyImport {
  // Size gate BEFORE parse — this is the one input surface fed by files
  // other people hand the DM, so it gets the same hard caps the
  // full-backup importer enforces.
  if (text.length > MAX_IMPORT_FILE_CHARS) {
    throw new Error(
      `This file is too large to be a Party export ` +
        `(${(text.length / 1_000_000).toFixed(1)} MB; max ${MAX_IMPORT_FILE_CHARS / 1_000_000} MB).`,
    );
  }
  const env = parseEnvelopeHead(text, "selene-dm-party", "Party export");
  if (!Array.isArray(env.party)) {
    throw new Error(
      "This Party file is incomplete or corrupted. Try exporting it again.",
    );
  }
  const dropped = Math.max(0, env.party.length - MAX_PARTY);
  const normalized = normalizePartyBatch(env.party.slice(0, MAX_PARTY));
  const summary: PartyImportSummary = {
    accepted: normalized.length,
    currentCount: readRaw().length,
    dropped,
    ...(typeof env.exportedAt === "string" ? { exportedAt: env.exportedAt } : {}),
  };
  return {
    summary,
    commit: () => {
      write(normalized);
      return normalized.length;
    },
  };
}

function nextId(_list: PlayerCharacter[]): number {
  // `readRaw` → `normalizePartyBatch` already bumped the counter past every
  // id in storage, so a fresh mint is guaranteed greater than the list max.
  return mintId();
}

// React hook: returns the current party, re-reads on cross-widget mutations.
export function useParty(): PlayerCharacter[] {
  const [party, setParty] = useState<PlayerCharacter[]>(() => readRaw());

  useEffect(() => {
    const refresh = () => setParty(readRaw());
    window.addEventListener(CHANGED_EVENT, refresh);
    // Cross-tab safety net: the native `storage` event fires in *other* tabs
    // after a write commits, so a second tab re-reads. This is a refresh, not
    // conflict resolution — there's no merge or version check, so two tabs
    // editing near-simultaneously is last-write-wins (documented as "use one
    // tab at a time" in the README). Don't mistake this listener for sync.
    //
    // Filter to OUR key: without it, every localStorage write in another
    // tab (including per-keystroke notepad/search-query writes) triggers a
    // full roster re-parse + re-render of both subscribed widgets.
    // `e.key === null` means `storage.clear()` — re-read for that too.
    const onStorage = (e: StorageEvent) => {
      if (e.key !== null && e.key !== STORAGE_KEY) return;
      refresh();
    };
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(CHANGED_EVENT, refresh);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  return party;
}
