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
    .map((s) => s.slice(0, PC_MAX_STRING));
}

function normalize(c: unknown): PlayerCharacter {
  const obj = c as Partial<PlayerCharacter>;
  const hasValidId = typeof obj.id === "number" && Number.isFinite(obj.id);
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
  // observed id (by `normalize`/`bumpIdCounter`), so freshly minted ids
  // are guaranteed greater than anything in the batch.
  seen.clear();
  return normalized.map((pc) => {
    if (seen.has(pc.id)) {
      const fresh = mintId();
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
  const env = parseEnvelopeHead(text, "selene-dm-party", "Party export");
  if (!Array.isArray(env.party)) {
    throw new Error("Envelope is missing a `party` array.");
  }
  const normalized = normalizePartyBatch(env.party);
  const summary: PartyImportSummary = {
    accepted: normalized.length,
    currentCount: readRaw().length,
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
    window.addEventListener("storage", refresh); // cross-tab safety net
    return () => {
      window.removeEventListener(CHANGED_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  return party;
}
