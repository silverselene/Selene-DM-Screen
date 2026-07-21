import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isV1Empty, runMigrationsOnce } from "./migrations";

// Minimal in-memory localStorage — migrations only get/set/remove.
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

let store: FakeStorage;
beforeEach(() => {
  store = new FakeStorage();
  vi.stubGlobal("window", { localStorage: store });
});
afterEach(() => vi.unstubAllGlobals());

const combatant = (id: string, initiative: number) => ({
  id,
  name: `c ${id}`,
  initiative,
  hp: 10,
  maxHp: 10,
  isPlayer: false,
});

describe("isV1Empty", () => {
  it("treats null and the literal string 'null' as empty", () => {
    expect(isV1Empty(null)).toBe(true);
    expect(isV1Empty("null")).toBe(true);
    expect(isV1Empty("[]")).toBe(false);
  });
});

describe("migrateLegacyInitiativeKeys (via runMigrationsOnce)", () => {
  it("copies each legacy key to its v1 counterpart and drops the legacy key", () => {
    const combatants = JSON.stringify([combatant("a", 12)]);
    store.setItem("dm-initiative", combatants);
    store.setItem("dm-round", JSON.stringify(4));

    runMigrationsOnce();

    expect(store.getItem("dm-initiative-v1")).toBe(combatants);
    expect(store.getItem("dm-round-v1")).toBe(JSON.stringify(4));
    expect(store.getItem("dm-initiative")).toBeNull();
    expect(store.getItem("dm-round")).toBeNull();
  });

  it("is idempotent — a second run changes nothing", () => {
    store.setItem("dm-initiative", JSON.stringify([combatant("a", 12)]));
    runMigrationsOnce();
    const after1 = store.getItem("dm-initiative-v1");

    runMigrationsOnce();
    expect(store.getItem("dm-initiative-v1")).toBe(after1);
    expect(store.getItem("dm-initiative")).toBeNull();
  });

  it("never clobbers populated v1 state — current state wins", () => {
    const current = JSON.stringify([combatant("current", 5)]);
    store.setItem("dm-initiative-v1", current);
    store.setItem("dm-initiative", JSON.stringify([combatant("stale", 1)]));

    runMigrationsOnce();

    expect(store.getItem("dm-initiative-v1")).toBe(current);
    expect(store.getItem("dm-initiative")).toBeNull(); // stale copy dropped
  });

  it("treats a v1 value of the string 'null' as empty and copies over it", () => {
    const legacy = JSON.stringify([combatant("a", 12)]);
    store.setItem("dm-initiative-v1", "null");
    store.setItem("dm-initiative", legacy);

    runMigrationsOnce();

    expect(store.getItem("dm-initiative-v1")).toBe(legacy);
  });
});

describe("migrateTurnIndexToActiveId (via runMigrationsOnce)", () => {
  it("converts a sort-index turn pointer to the matching combatant id", () => {
    // Sorted by initiative desc: b (20) is index 0, a (5) is index 1.
    store.setItem(
      "dm-initiative-v1",
      JSON.stringify([combatant("a", 5), combatant("b", 20)]),
    );
    store.setItem("dm-initiative-turn-v1", JSON.stringify(1));

    runMigrationsOnce();

    expect(store.getItem("dm-initiative-active-id-v1")).toBe(
      JSON.stringify("a"),
    );
    expect(store.getItem("dm-initiative-turn-v1")).toBeNull();
  });

  it("clamps an out-of-range index to the last combatant", () => {
    store.setItem(
      "dm-initiative-v1",
      JSON.stringify([combatant("a", 5), combatant("b", 20)]),
    );
    store.setItem("dm-initiative-turn-v1", JSON.stringify(99));

    runMigrationsOnce();

    expect(store.getItem("dm-initiative-active-id-v1")).toBe(
      JSON.stringify("a"), // lowest initiative = last in sorted order
    );
  });

  it("is idempotent and respects an already-populated active id", () => {
    store.setItem("dm-initiative-active-id-v1", JSON.stringify("keep-me"));
    store.setItem("dm-initiative-turn-v1", JSON.stringify(0));

    runMigrationsOnce();
    runMigrationsOnce();

    expect(store.getItem("dm-initiative-active-id-v1")).toBe(
      JSON.stringify("keep-me"),
    );
    expect(store.getItem("dm-initiative-turn-v1")).toBeNull();
  });

  it("persists the validated list so a minted active id can't dangle", () => {
    // Legacy/hand-edited combatants with no ids: validation mints fresh
    // random ids, and the pointer is written from THOSE. If the raw list
    // stays in storage unmodified, the widget's read path re-validates it
    // and mints DIFFERENT ids — the pointer dangles and the widget's
    // reconciliation effect resets it to null, silently undoing the
    // migration's one job.
    store.setItem(
      "dm-initiative-v1",
      JSON.stringify([
        { name: "a", initiative: 20, hp: 10, maxHp: 10, isPlayer: false },
        { name: "b", initiative: 10, hp: 10, maxHp: 10, isPlayer: false },
      ]),
    );
    store.setItem("dm-initiative-turn-v1", JSON.stringify(1));

    runMigrationsOnce();

    const activeId = JSON.parse(store.getItem("dm-initiative-active-id-v1")!);
    const persisted = JSON.parse(store.getItem("dm-initiative-v1")!) as {
      id?: string;
      name: string;
    }[];
    const target = persisted.find((c) => c.id === activeId);
    expect(target?.name).toBe("b");
  });

  it("drops a malformed turn index without minting an active id", () => {
    store.setItem("dm-initiative-turn-v1", JSON.stringify("not-a-number"));

    runMigrationsOnce();

    expect(store.getItem("dm-initiative-active-id-v1")).toBeNull();
    expect(store.getItem("dm-initiative-turn-v1")).toBeNull();
  });
});

describe("dropLegacyOracleKeys (via runMigrationsOnce)", () => {
  it("deletes the superseded oracle keys and leaves v2 alone", () => {
    store.setItem("dm-oracle-result-v1", JSON.stringify("old result"));
    store.setItem("dm-oracle-history-v1", JSON.stringify(["old"]));
    store.setItem("dm-oracle-history-v2", JSON.stringify({ names: ["new"] }));

    runMigrationsOnce();

    expect(store.getItem("dm-oracle-result-v1")).toBeNull();
    expect(store.getItem("dm-oracle-history-v1")).toBeNull();
    expect(store.getItem("dm-oracle-history-v2")).toBe(
      JSON.stringify({ names: ["new"] }),
    );
  });
});
