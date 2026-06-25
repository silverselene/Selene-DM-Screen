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
    return parsed.map(normalize);
  } catch {
    return [];
  }
}

function normalize(c: unknown): PlayerCharacter {
  const obj = c as Partial<PlayerCharacter>;
  return {
    id: typeof obj.id === "number" ? obj.id : Date.now(),
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
  const normalized = env.party.map(normalize);
  write(normalized);
  return normalized.length;
}

function nextId(list: PlayerCharacter[]): number {
  const max = list.reduce((m, c) => (c.id > m ? c.id : m), 0);
  // Combine "monotonic since boot" with the max id seen — handles the rare
  // case where the user deletes the most recent entry and adds another in
  // the same millisecond.
  return Math.max(max + 1, Date.now());
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
