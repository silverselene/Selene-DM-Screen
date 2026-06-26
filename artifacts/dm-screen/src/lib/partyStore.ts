// Shared party roster persistence. The Party widget owns CRUD; the Initiative
// widget reads it so "add party member to initiative" works without a server.
//
// Storage: a single versioned localStorage key (dm-party-v1). Cross-widget
// sync within the same tab is done via a `dm-party-changed` CustomEvent the
// store dispatches on every mutation — the storage event alone doesn't fire
// for same-tab writes.

import { useEffect, useState } from "react";

import type { PlayerCharacter } from "@/types";

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

function normalize(c: unknown): PlayerCharacter {
  const obj = c as Partial<PlayerCharacter>;
  const hasValidId = typeof obj.id === "number" && Number.isFinite(obj.id);
  if (hasValidId) bumpIdCounter(obj.id as number);
  return {
    id: hasValidId ? (obj.id as number) : mintId(),
    name: typeof obj.name === "string" ? obj.name : "",
    race: typeof obj.race === "string" ? obj.race : null,
    class: typeof obj.class === "string" ? obj.class : null,
    level: typeof obj.level === "number" ? obj.level : 1,
    ac: typeof obj.ac === "number" ? obj.ac : null,
    hp: typeof obj.hp === "number" ? obj.hp : null,
    spells: Array.isArray(obj.spells) ? obj.spells.filter(isString) : [],
    weapons: Array.isArray(obj.weapons) ? obj.weapons.filter(isString) : [],
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
  } catch {
    // quota / private mode — ignore; in-memory state remains
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

/** Validate + write an import envelope. Returns the imported count, or
 *  throws on a malformed file (caller renders the message). */
export function importPartyFromJson(text: string): number {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    throw new Error("File isn't valid JSON.");
  }
  if (!parsed || typeof parsed !== "object") {
    throw new Error("File isn't a Party export.");
  }
  const env = parsed as Partial<PartyExportEnvelope>;
  if (env.schema !== "selene-dm-party") {
    throw new Error(
      `Unexpected schema "${env.schema ?? "?"}" — looking for "selene-dm-party".`,
    );
  }
  if (!Array.isArray(env.party)) {
    throw new Error("Envelope is missing a `party` array.");
  }
  const normalized = normalizePartyBatch(env.party);
  write(normalized);
  return normalized.length;
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
