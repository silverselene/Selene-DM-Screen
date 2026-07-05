import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  addCharacter,
  exportPartyAsJson,
  loadParty,
  MAX_PARTY,
  preparePartyImport,
} from "./partyStore";
import type { PlayerCharacter } from "@/types";

// Minimal in-memory localStorage. No quota — the quota paths are covered
// in backup.test.ts; these tests pin the party import/export contract.
class FakeStorage {
  private m = new Map<string, string>();
  get length() {
    return this.m.size;
  }
  key(i: number): string | null {
    return Array.from(this.m.keys())[i] ?? null;
  }
  getItem(k: string): string | null {
    return this.m.has(k) ? this.m.get(k)! : null;
  }
  setItem(k: string, v: string): void {
    this.m.set(k, String(v));
  }
  removeItem(k: string): void {
    this.m.delete(k);
  }
  clear(): void {
    this.m.clear();
  }
}

function installWindow(): FakeStorage {
  const store = new FakeStorage();
  // `partyStore.write` dispatches a CustomEvent after every persist;
  // stub dispatchEvent so writes don't explode in the Node environment.
  vi.stubGlobal("window", { localStorage: store, dispatchEvent: () => true });
  return store;
}

function partyEnvelope(party: unknown[]): string {
  return JSON.stringify({
    schema: "selene-dm-party",
    version: 1,
    exportedAt: new Date().toISOString(),
    party,
  });
}

const pc = (name: string): Omit<PlayerCharacter, "id"> => ({
  name,
  race: null,
  class: null,
  level: 1,
  ac: null,
  hp: null,
  spells: [],
  weapons: [],
});

beforeEach(() => installWindow());
afterEach(() => vi.unstubAllGlobals());

describe("party export → import round-trip", () => {
  it("reproduces the roster exactly", () => {
    addCharacter({ ...pc("Selene"), race: "Elf", class: "Wizard", level: 5, ac: 15, hp: 30, spells: ["Fire Bolt"] });
    addCharacter(pc("Bran"));
    const before = loadParty();

    const { summary, commit } = preparePartyImport(exportPartyAsJson());
    expect(summary.accepted).toBe(2);
    expect(summary.currentCount).toBe(2);
    expect(summary.dropped).toBe(0);
    commit();

    expect(loadParty()).toEqual(before);
  });

  it("imports an empty party file, replacing the current roster", () => {
    addCharacter(pc("Selene"));

    const { summary, commit } = preparePartyImport(partyEnvelope([]));
    expect(summary.accepted).toBe(0);
    expect(summary.currentCount).toBe(1);
    commit();

    expect(loadParty()).toEqual([]);
  });

  it("renumbers duplicate ids while preserving order and fields", () => {
    const { commit } = preparePartyImport(
      partyEnvelope([
        { id: 1, name: "A" },
        { id: 1, name: "B" },
      ]),
    );
    commit();

    const loaded = loadParty();
    expect(loaded.map((c) => c.name)).toEqual(["A", "B"]);
    expect(loaded[0].id).toBe(1);
    expect(loaded[1].id).not.toBe(1);
  });
});

describe("party import caps (finding #5)", () => {
  it("rejects an oversized file before parsing it", () => {
    expect(() => preparePartyImport("x".repeat(2_000_001))).toThrow(
      /too large/i,
    );
  });

  it("slices to MAX_PARTY and reports the dropped count", () => {
    const over = MAX_PARTY + 5;
    const { summary, commit } = preparePartyImport(
      partyEnvelope(
        Array.from({ length: over }, (_, i) => ({ name: `PC ${i}` })),
      ),
    );
    expect(summary.accepted).toBe(MAX_PARTY);
    expect(summary.dropped).toBe(5);
    commit();
    expect(loadParty()).toHaveLength(MAX_PARTY);
  });

  it("caps per-PC spells/weapons list lengths", () => {
    const { commit } = preparePartyImport(
      partyEnvelope([
        {
          name: "Hoarder",
          spells: Array.from({ length: 500 }, (_, i) => `spell-${i}`),
          weapons: Array.from({ length: 500 }, (_, i) => `weapon-${i}`),
        },
      ]),
    );
    commit();
    const [loaded] = loadParty();
    expect(loaded.spells).toHaveLength(100);
    expect(loaded.weapons).toHaveLength(100);
  });

  it("refuses a 51st live add instead of letting restore truncate later", () => {
    for (let i = 0; i < MAX_PARTY; i++) addCharacter(pc(`PC ${i}`));
    expect(() => addCharacter(pc("One Too Many"))).toThrow(/party is full/i);
    expect(loadParty()).toHaveLength(MAX_PARTY);
  });
});

describe("party envelope validation", () => {
  it("rejects a file with the wrong schema", () => {
    const wrong = JSON.stringify({ schema: "selene-dm-full", version: 1, keys: {} });
    expect(() => preparePartyImport(wrong)).toThrow();
  });

  it("rejects an envelope without a party array", () => {
    const noParty = JSON.stringify({ schema: "selene-dm-party", version: 1 });
    expect(() => preparePartyImport(noParty)).toThrow(/incomplete or corrupted/i);
  });
});
