import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { PLACEABLE_WIDGET_TYPES } from "@/types";
import {
  MAX_TILES,
  NOTEPAD_MAX_CHARS,
  exportFullBackupAsJson,
  prepareImport,
  validateArrayOfEnum,
  validateBoundedInt,
  validateEnum,
  validateStringMax,
  validateTiles,
} from "./backup";
import { registerPendingWrite } from "./pendingWrites";

// ── Pure shape validators (no storage) ────────────────────────────────────

describe("validateBoundedInt", () => {
  const v = validateBoundedInt(2, 4);
  it("accepts an in-range integer", () => expect(v(3)).toBe(3));
  it("rejects out-of-range, non-integer, non-number", () => {
    expect(v(1)).toBeUndefined();
    expect(v(5)).toBeUndefined();
    expect(v(3.5)).toBeUndefined();
    expect(v("3")).toBeUndefined();
    expect(v(NaN)).toBeUndefined();
  });
});

describe("validateEnum", () => {
  const v = validateEnum(["dark", "light"] as const);
  it("accepts a member, rejects a non-member / non-string", () => {
    expect(v("dark")).toBe("dark");
    expect(v("blue")).toBeUndefined();
    expect(v(1)).toBeUndefined();
  });
});

describe("validateArrayOfEnum (recent-widgets, finding #11)", () => {
  const v = validateArrayOfEnum(PLACEABLE_WIDGET_TYPES, MAX_TILES);
  it("filters out 'empty' and unknown values", () => {
    expect(v(["empty", "party", "bogus", "initiative"])).toEqual([
      "party",
      "initiative",
    ]);
  });
  it("rejects a non-array and caps length", () => {
    expect(v("party")).toBeUndefined();
    expect(v(Array(MAX_TILES + 5).fill("party"))).toHaveLength(MAX_TILES);
  });
});

describe("validateTiles", () => {
  it("rejects an over-long tiles array", () => {
    expect(validateTiles(Array(MAX_TILES + 1).fill(null))).toBeUndefined();
  });
  it("preserves nulls and maps unknown widgets to 'empty'", () => {
    const out = validateTiles([
      null,
      { widget: "party", colSpan: 2, rowSpan: 1 },
      { widget: "not-real", colSpan: 9, rowSpan: 0 },
    ]);
    expect(out?.[0]).toBeNull();
    expect(out?.[1]).toEqual({ widget: "party", colSpan: 2, rowSpan: 1 });
    // Unknown widget → "empty"; out-of-range spans clamp to 1.
    expect(out?.[2]).toEqual({ widget: "empty", colSpan: 1, rowSpan: 1 });
  });
});

describe("validateStringMax (Notepad, finding #4)", () => {
  const v = validateStringMax(10);
  it("accepts a short string, rejects over-length and non-string", () => {
    expect(v("hello")).toBe("hello");
    expect(v("x".repeat(11))).toBeUndefined();
    expect(v(42)).toBeUndefined();
  });
  it("exposes a 1 MB Notepad cap", () => {
    expect(NOTEPAD_MAX_CHARS).toBe(1_000_000);
  });
});

// ── Import flow (fake localStorage) ───────────────────────────────────────

class FakeStorage {
  private m = new Map<string, string>();
  constructor(private maxChars = Infinity) {}
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
    const value = String(v);
    let total = k.length + value.length;
    for (const [ek, ev] of this.m) if (ek !== k) total += ek.length + ev.length;
    if (total > this.maxChars) {
      const err = new Error("QuotaExceededError");
      err.name = "QuotaExceededError";
      throw err;
    }
    this.m.set(k, value);
  }
  removeItem(k: string): void {
    this.m.delete(k);
  }
  clear(): void {
    this.m.clear();
  }
}

function installStorage(maxChars = Infinity): FakeStorage {
  const store = new FakeStorage(maxChars);
  vi.stubGlobal("window", { localStorage: store });
  return store;
}

function envelope(keys: Record<string, string>): string {
  return JSON.stringify({
    schema: "selene-dm-full",
    version: 1,
    exportedAt: new Date().toISOString(),
    keys,
  });
}

afterEach(() => vi.unstubAllGlobals());

describe("full backup round-trip", () => {
  beforeEach(() => installStorage());

  it("exports current dm-* state and restores it byte-for-byte", () => {
    window.localStorage.setItem("dm-notepad", JSON.stringify("session notes"));
    window.localStorage.setItem("dm-round-v1", JSON.stringify(3));

    const json = exportFullBackupAsJson();
    window.localStorage.clear();

    const { summary, commit } = prepareImport(json);
    expect(summary.accepted).toBe(2);
    expect(summary.skipped).toHaveLength(0);
    commit();

    expect(JSON.parse(window.localStorage.getItem("dm-notepad")!)).toBe(
      "session notes",
    );
    expect(JSON.parse(window.localStorage.getItem("dm-round-v1")!)).toBe(3);
  });

  it("cleans 'empty' out of an imported recent-widgets list (finding #11)", () => {
    const { commit } = prepareImport(
      envelope({
        "dm-recent-widgets": JSON.stringify(["empty", "party", "bogus"]),
      }),
    );
    commit();
    expect(JSON.parse(window.localStorage.getItem("dm-recent-widgets")!)).toEqual(
      ["party"],
    );
  });
});

describe("grid triple consistency (finding #9)", () => {
  beforeEach(() => installStorage());

  it("evicts the whole grid triple when tiles.length != cols*rows", () => {
    const { summary } = prepareImport(
      envelope({
        "dm-grid-cols": JSON.stringify(4),
        "dm-grid-rows": JSON.stringify(4),
        "dm-tiles-v3": JSON.stringify(Array(9).fill(null)), // 9 != 16
      }),
    );
    expect(summary.accepted).toBe(0);
    expect(summary.skipped).toEqual(
      expect.arrayContaining(["dm-grid-cols", "dm-grid-rows", "dm-tiles-v3"]),
    );
  });

  it("keeps a consistent grid triple (tiles.length == cols*rows)", () => {
    const { summary } = prepareImport(
      envelope({
        "dm-grid-cols": JSON.stringify(3),
        "dm-grid-rows": JSON.stringify(3),
        "dm-tiles-v3": JSON.stringify(Array(9).fill(null)), // 9 == 9
      }),
    );
    expect(summary.accepted).toBe(3);
    expect(summary.skipped).toHaveLength(0);
  });
});

describe("pre-flight quota guard (finding #3)", () => {
  it("aborts an over-quota import and leaves existing data untouched", () => {
    // Existing state fits; the incoming payload is larger than the quota.
    const store = installStorage(300);
    window.localStorage.setItem("dm-notepad", JSON.stringify("A".repeat(100)));

    const { commit } = prepareImport(
      envelope({ "dm-notepad": JSON.stringify("B".repeat(500)) }),
    );

    expect(() => commit()).toThrow(/not enough browser storage/i);
    // The pre-flight ran before the wipe, so the original note survives.
    expect(JSON.parse(store.getItem("dm-notepad")!)).toBe("A".repeat(100));
    // The probe key is cleaned up.
    expect(store.getItem("dm-__import_probe__")).toBeNull();
  });
});

// The rollback is the most destructive code path in the app — it only runs
// after the wipe has already happened, so a regression here IS data loss.
// Both branches are pinned: a mid-commit write failure must restore the
// prepare-time snapshot, and a rollback that itself fails must say so
// explicitly instead of pretending recovery worked.
describe("commit rollback (mid-write failure)", () => {
  const quotaErr = () => {
    const err = new Error("QuotaExceededError");
    err.name = "QuotaExceededError";
    return err;
  };

  it("restores the snapshot when a write throws mid-commit", () => {
    const store = installStorage();
    window.localStorage.setItem("dm-notepad", JSON.stringify("original note"));
    window.localStorage.setItem("dm-round-v1", JSON.stringify(7));

    const { commit } = prepareImport(
      envelope({
        "dm-notepad": JSON.stringify("imported note"),
        "dm-round-v1": JSON.stringify(2),
      }),
    );

    // Sabotage exactly one commit-phase write (the pairs are written in
    // envelope order, so dm-notepad lands first and dm-round-v1 throws),
    // then behave normally so the rollback's snapshot re-writes succeed.
    // The payload is smaller than the snapshot, so the quota pre-flight
    // takes its delta<=0 fast path and never touches the sabotaged store.
    const realSetItem = store.setItem.bind(store);
    let armed = true;
    store.setItem = (k: string, v: string) => {
      if (armed && k === "dm-round-v1") {
        armed = false;
        throw quotaErr();
      }
      realSetItem(k, v);
    };

    expect(() => commit()).toThrow(/previous data has been restored/i);
    // Snapshot fully restored — including the key whose new value DID
    // write before the failure.
    expect(JSON.parse(store.getItem("dm-notepad")!)).toBe("original note");
    expect(JSON.parse(store.getItem("dm-round-v1")!)).toBe(7);
  });

  it("reports the unrecoverable state when the rollback also fails", () => {
    const store = installStorage();
    window.localStorage.setItem("dm-notepad", JSON.stringify("original note"));

    const { commit } = prepareImport(
      envelope({ "dm-round-v1": JSON.stringify(2) }),
    );

    // Every write fails from here on: the commit's first pair write
    // throws AND the rollback's snapshot re-write throws.
    store.setItem = () => {
      throw quotaErr();
    };

    expect(() => commit()).toThrow(/rollback failed.*do not reload/is);
  });
});

// A debounced widget write (useLocalStorage's debounceWriteMs) lives only
// in memory until its timer fires; the export/import sweeps read
// localStorage directly. These pin that both sweep entry points run the
// pendingWrites registry first, so a backup can never miss keystrokes
// still sitting in a debounce timer.
describe("flush of pending debounced writes (finding: stale backup)", () => {
  it("exportFullBackupAsJson flushes registered pending writes first", () => {
    installStorage();
    window.localStorage.setItem("dm-notepad", JSON.stringify("stale note"));

    // Simulate a pending debounced write: the flush lands the fresh value.
    const unregister = registerPendingWrite(() => {
      window.localStorage.setItem("dm-notepad", JSON.stringify("fresh note"));
    });
    try {
      const exported = JSON.parse(exportFullBackupAsJson());
      expect(exported.keys["dm-notepad"]).toBe(JSON.stringify("fresh note"));
    } finally {
      unregister();
    }
  });

  it("prepareImport flushes before snapshotting, so rollback restores the flushed value", () => {
    const store = installStorage();
    window.localStorage.setItem("dm-notepad", JSON.stringify("stale note"));

    const unregister = registerPendingWrite(() => {
      window.localStorage.setItem("dm-notepad", JSON.stringify("fresh note"));
    });
    try {
      const { commit } = prepareImport(
        envelope({ "dm-round-v1": JSON.stringify(2) }),
      );
      // Fail the first commit-phase write so the snapshot is rolled back.
      const realSetItem = store.setItem.bind(store);
      let armed = true;
      store.setItem = (k: string, v: string) => {
        if (armed && k === "dm-round-v1") {
          armed = false;
          const err = new Error("QuotaExceededError");
          err.name = "QuotaExceededError";
          throw err;
        }
        realSetItem(k, v);
      };

      expect(() => commit()).toThrow(/previous data has been restored/i);
      // The snapshot captured the FLUSHED note, not the stale one.
      expect(JSON.parse(store.getItem("dm-notepad")!)).toBe("fresh note");
    } finally {
      unregister();
    }
  });
});
