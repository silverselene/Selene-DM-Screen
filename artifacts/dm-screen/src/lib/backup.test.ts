import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { PLACEABLE_WIDGET_TYPES, type TileEntry } from "@/types";
import {
  MAX_TILES,
  NOTEPAD_MAX_CHARS,
  exportFullBackupAsJson,
  prepareImport,
  tilesLayoutConsistent,
  validateArrayOfEnum,
  validateBoundedInt,
  validateEnum,
  validateStringMax,
  validateTiles,
} from "./backup";
import { registerPendingWrite } from "./pendingWrites";
import { validateChatHistory } from "./chatHistory";

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

describe("dm-ai-chat-v1 backup round-trip", () => {
  beforeEach(() => installStorage());

  it("accepts a valid transcript and skips a malformed one", () => {
    // Explicit ids keep the double-validation comparison below deterministic
    // (the validator mints fresh ids for messages that lack one).
    const good = JSON.stringify([
      { id: "m-1", role: "user", text: "hi" },
      { id: "m-2", role: "assistant", text: "hey", tools: [], cards: [], toolErrors: [], pending: false },
    ]);
    const okPrep = prepareImport(envelope({ "dm-ai-chat-v1": good }));
    expect(okPrep.summary.accepted).toBe(1);
    expect(okPrep.summary.skipped).not.toContain("dm-ai-chat-v1");
    okPrep.commit();
    // pending is normalized to false by the shared validator on import.
    expect(JSON.parse(window.localStorage.getItem("dm-ai-chat-v1")!)).toEqual(
      validateChatHistory(JSON.parse(good)),
    );

    const badPrep = prepareImport(envelope({ "dm-ai-chat-v1": JSON.stringify({ not: "an array" }) }));
    expect(badPrep.summary.skipped).toContain("dm-ai-chat-v1");
  });
});

describe("pre-parse file-size gate", () => {
  beforeEach(() => installStorage());

  it("rejects an oversized file before parsing it", () => {
    // A syntactically VALID envelope over the cap: without a pre-parse
    // gate, the whole file reaches JSON.parse (the hang/OOM the party
    // importer's identical gate exists to prevent) and then sails through
    // — per-value caps only skip the oversized value, they don't throw.
    const huge = envelope({ "dm-huge": "x".repeat(33_000_000) });
    expect(() => prepareImport(huge)).toThrow(/too large/i);
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
    const emptyTile = { widget: "empty", colSpan: 1, rowSpan: 1 };
    const { summary } = prepareImport(
      envelope({
        "dm-grid-cols": JSON.stringify(3),
        "dm-grid-rows": JSON.stringify(3),
        "dm-tiles-v3": JSON.stringify(Array(9).fill(emptyTile)), // 9 == 9
      }),
    );
    expect(summary.accepted).toBe(3);
    expect(summary.skipped).toHaveLength(0);
  });

  it("keeps a valid spanned layout (span cells are null placeholders)", () => {
    const emptyTile = { widget: "empty", colSpan: 1, rowSpan: 1 };
    // A 2×1 notepad at index 0 with its placeholder null at index 1.
    const tiles = [
      { widget: "notepad", colSpan: 2, rowSpan: 1 },
      null,
      emptyTile,
      emptyTile,
      emptyTile,
      emptyTile,
      emptyTile,
      emptyTile,
      emptyTile,
    ];
    const { summary } = prepareImport(
      envelope({
        "dm-grid-cols": JSON.stringify(3),
        "dm-grid-rows": JSON.stringify(3),
        "dm-tiles-v3": JSON.stringify(tiles),
      }),
    );
    expect(summary.accepted).toBe(3);
    expect(summary.skipped).toHaveLength(0);
  });

  it("evicts the triple when a spanned tile lacks its null placeholder", () => {
    const emptyTile = { widget: "empty", colSpan: 1, rowSpan: 1 };
    // A 2×1 tile at index 0 whose second cell (index 1) is a REAL tile, not
    // the required null placeholder — the two would render overlapping.
    const tiles = [
      { widget: "notepad", colSpan: 2, rowSpan: 1 },
      { widget: "party", colSpan: 1, rowSpan: 1 }, // should be null
      emptyTile,
      emptyTile,
      emptyTile,
      emptyTile,
      emptyTile,
      emptyTile,
      emptyTile,
    ];
    const { summary } = prepareImport(
      envelope({
        "dm-grid-cols": JSON.stringify(3),
        "dm-grid-rows": JSON.stringify(3),
        "dm-tiles-v3": JSON.stringify(tiles),
      }),
    );
    expect(summary.accepted).toBe(0);
    expect(summary.skipped).toEqual(
      expect.arrayContaining(["dm-grid-cols", "dm-grid-rows", "dm-tiles-v3"]),
    );
  });

  it("evicts the triple when a span exceeds the grid bounds", () => {
    const emptyTile = { widget: "empty", colSpan: 1, rowSpan: 1 };
    // A 2-wide tile in the last column (index 2) overflows a 3-wide grid.
    const tiles = [
      emptyTile,
      emptyTile,
      { widget: "notepad", colSpan: 2, rowSpan: 1 },
      emptyTile,
      emptyTile,
      emptyTile,
      emptyTile,
      emptyTile,
      emptyTile,
    ];
    const { summary } = prepareImport(
      envelope({
        "dm-grid-cols": JSON.stringify(3),
        "dm-grid-rows": JSON.stringify(3),
        "dm-tiles-v3": JSON.stringify(tiles),
      }),
    );
    expect(summary.accepted).toBe(0);
    expect(summary.skipped).toEqual(
      expect.arrayContaining(["dm-grid-cols", "dm-grid-rows", "dm-tiles-v3"]),
    );
  });

});

// tilesLayoutConsistent is exported and used with an `as TileEntry[]` cast on
// both paths (App's read-path repack, the import triple check). Those callers
// happen to pre-coerce spans to 1|2 (via validateTiles) before calling, so the
// import path never reaches it with a bad span — but the predicate defends its
// own contract rather than trusting every caller, so exercise that directly.
describe("tilesLayoutConsistent (defense-in-depth)", () => {
  const emptyTile = { widget: "empty", colSpan: 1, rowSpan: 1 } as const;
  const grid = (first: unknown) =>
    [first, ...Array(8).fill(emptyTile)] as TileEntry[];

  it("accepts a valid 1×1 layout", () => {
    expect(tilesLayoutConsistent(grid(emptyTile), 3, 3)).toBe(true);
  });

  it("accepts a valid 2×1 span with its null placeholder", () => {
    const tiles = [
      { widget: "notepad", colSpan: 2, rowSpan: 1 },
      null,
      ...Array(7).fill(emptyTile),
    ] as TileEntry[];
    expect(tilesLayoutConsistent(tiles, 3, 3)).toBe(true);
  });

  it.each([0, 3, NaN, undefined, "2"])(
    "rejects a non-{1,2} colSpan (%s) instead of treating it as a phantom 1×1",
    (colSpan) => {
      const tiles = grid({ widget: "notepad", colSpan, rowSpan: 1 });
      expect(tilesLayoutConsistent(tiles, 3, 3)).toBe(false);
    },
  );

  it("rejects two spans that overlap on a shared null cell", () => {
    // 3×3 grid. A colSpan:1/rowSpan:2 tile at index 1 covers cells {1,4};
    // a colSpan:2/rowSpan:1 tile at index 3 covers cells {3,4}. Cell 4 is a
    // `null` placeholder that BOTH legitimately require, so the per-cell
    // `tiles[idx] !== null` check passes for each — the overlap only shows
    // up as cell 4 being claimed twice. These render on top of each other.
    const tiles = [
      emptyTile,
      { widget: "notepad", colSpan: 1, rowSpan: 2 },
      emptyTile,
      { widget: "bestiary", colSpan: 2, rowSpan: 1 },
      null, // cell 4 — claimed by both spans above
      emptyTile,
      emptyTile,
      emptyTile,
      emptyTile,
    ] as TileEntry[];
    expect(tilesLayoutConsistent(tiles, 3, 3)).toBe(false);
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
