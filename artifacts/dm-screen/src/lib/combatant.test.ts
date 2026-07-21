import { describe, it, expect } from "vitest";
import {
  AC_MAX,
  HP_MAX,
  INIT_MAX,
  INIT_MIN,
  MAX_COMBATANTS,
  mintCombatantId,
  validateCombatants,
  validateInitiativeActiveId,
} from "./combatant";

describe("mintCombatantId", () => {
  it("produces the c-<suffix> shape", () => {
    expect(mintCombatantId()).toMatch(/^c-[a-z0-9]+$/);
  });

  it("does not collide across many mints", () => {
    const ids = new Set(Array.from({ length: 5000 }, () => mintCombatantId()));
    // Allow for the astronomically unlikely random clash, but it should be rare
    // enough that 5000 mints stay effectively unique.
    expect(ids.size).toBeGreaterThan(4990);
  });
});

describe("validateInitiativeActiveId", () => {
  it("treats null as the legitimate 'no active combatant' value", () => {
    expect(validateInitiativeActiveId(null)).toBeNull();
  });

  it("passes a clean id through", () => {
    expect(validateInitiativeActiveId("c-abc123")).toBe("c-abc123");
  });

  it("rejects empty, over-long, and non-string ids", () => {
    expect(validateInitiativeActiveId("")).toBeUndefined();
    expect(validateInitiativeActiveId("x".repeat(65))).toBeUndefined();
    expect(validateInitiativeActiveId(42)).toBeUndefined();
    expect(validateInitiativeActiveId(undefined)).toBeUndefined();
  });
});

describe("validateCombatants", () => {
  it("rejects a non-array outright", () => {
    expect(validateCombatants("nope")).toBeUndefined();
    expect(validateCombatants({})).toBeUndefined();
  });

  it("drops non-object elements instead of making empty rows", () => {
    const out = validateCombatants(["goblin", 3, null, { name: "Orc" }]);
    expect(out).toHaveLength(1);
    expect(out?.[0].name).toBe("Orc");
  });

  it("coerces NaN / non-numeric hp, maxHp, initiative to 0", () => {
    const [c] = validateCombatants([
      { name: "X", hp: "foo", maxHp: NaN, initiative: undefined },
    ])!;
    expect(c.hp).toBe(0);
    expect(c.maxHp).toBe(0);
    expect(c.initiative).toBe(0);
  });

  it("mints an id when missing or malformed, preserving valid ones", () => {
    const out = validateCombatants([
      { name: "Keep", id: "c-keep" },
      { name: "Mint", id: "" },
      { name: "MintToo" },
    ])!;
    expect(out[0].id).toBe("c-keep");
    expect(out[1].id).toMatch(/^c-/);
    expect(out[2].id).toMatch(/^c-/);
  });

  it("renumbers duplicate ids so no two combatants share one (finding #1 defense)", () => {
    const out = validateCombatants([
      { name: "A", id: "dup" },
      { name: "B", id: "dup" },
      { name: "C", id: "dup" },
    ])!;
    const ids = out.map((c) => c.id);
    expect(new Set(ids).size).toBe(3);
    // The first occurrence keeps the original id; later collisions are reminted.
    expect(ids[0]).toBe("dup");
    expect(ids[1]).not.toBe("dup");
    expect(ids[2]).not.toBe("dup");
  });

  it("clamps out-of-range numerics to the same bounds the typed paths use", () => {
    // A hand-edited/hostile backup can plant absurd finite numbers that every
    // typed add path would have clamped (clampInitiative, the widget's
    // HP_MAX/AC_MAX). The import path must not be weaker than the input paths.
    const [c] = validateCombatants([
      {
        name: "Cheater",
        initiative: 1e308,
        hp: -5e12,
        maxHp: 1e308,
        ac: 1e308,
      },
    ])!;
    expect(c.initiative).toBe(INIT_MAX);
    expect(c.hp).toBe(0);
    expect(c.maxHp).toBe(HP_MAX);
    expect(c.ac).toBe(AC_MAX);
  });

  it("clamps a very negative initiative up to INIT_MIN", () => {
    const [c] = validateCombatants([{ name: "Slow", initiative: -1e12 }])!;
    expect(c.initiative).toBe(INIT_MIN);
  });

  it("floors ac at 0 and leaves an absent ac undefined", () => {
    const [neg, absent] = validateCombatants([
      { name: "NegAc", ac: -5 },
      { name: "NoAc" },
    ])!;
    expect(neg.ac).toBe(0);
    expect(absent.ac).toBeUndefined();
  });

  it("truncates a pathologically long list to MAX_COMBATANTS", () => {
    const huge = Array.from({ length: MAX_COMBATANTS + 50 }, (_, i) => ({
      name: `C${i}`,
    }));
    expect(validateCombatants(huge)).toHaveLength(MAX_COMBATANTS);
  });
});

import { afterEach, vi } from "vitest";
import {
  addCombatantToInitiative,
  appendCombatant,
  decideInitiativeAdd,
  duplicatePlayerMessage,
  findDuplicatePlayer,
  handleAddToInitiativeEvent,
  INITIATIVE_STORAGE_KEY,
  type AddOutcome,
  type ConfirmDuplicate,
} from "./combatant";
import type { Combatant } from "@/types";

function mkPlayer(name = "Aragorn", initiative = 18): Combatant {
  return { id: mintCombatantId(), name, initiative, hp: 30, maxHp: 30, isPlayer: true };
}

function mkMonster(name = "Goblin", initiative = 12): Combatant {
  return { id: mintCombatantId(), name, initiative, hp: 7, maxHp: 7, isPlayer: false };
}

interface InstallOpts {
  /** Seeds localStorage — the authority only when NO widget is mounted. */
  seed?: Combatant[];
  /** Mount a model Initiative widget holding this list in memory. Omit to model
   *  "no Initiative tile placed", where nothing consumes the event. */
  mounted?: Combatant[];
  /** Mount a SECOND model widget with its own in-memory list — the DM placed
   *  Initiative in two tiles (the widget picker doesn't filter already-placed
   *  types). Both copies listen on `window` and see every dispatch. */
  secondMounted?: Combatant[];
  throwOnRead?: boolean;
  /** Make every mounted widget's commit throw, modelling a listener that blows
   *  up mid-add. */
  throwOnCommit?: boolean;
}

interface Installed {
  /** The backing localStorage map. */
  storage: Map<string, string>;
  /** The mounted widget's live in-memory list, mutated in place by its adds. */
  mounted: Combatant[] | null;
  /** The second widget's list, when `secondMounted` was supplied. */
  secondMounted: Combatant[] | null;
}

/**
 * Stub `window` for the add paths.
 *
 * The mounted-widget model is deliberately thin: it delegates to the REAL
 * `handleAddToInitiativeEvent` and a `commit` that mirrors InitiativeWidget's
 * `commitAdd` (decide against the in-memory list, append on success). So these
 * tests exercise the actual producer/consumer pair rather than a hand-written
 * restatement of the handler that would keep passing as the widget drifted.
 */
function installWindow(opts: InstallOpts = {}): Installed {
  const storage = new Map<string, string>();
  if (opts.seed) storage.set(INITIATIVE_STORAGE_KEY, JSON.stringify(opts.seed));

  /** One mounted Initiative widget: an in-memory list plus the `commit` its
   *  listener hands to the shared handler. */
  const mkWidget = (initial: Combatant[]) => {
    const list = [...initial];
    const commit = (c: Combatant, confirmDuplicate?: ConfirmDuplicate): AddOutcome => {
      if (opts.throwOnCommit) throw new Error("commit blew up");
      const decision = decideInitiativeAdd(list, c, confirmDuplicate);
      if (decision !== "added") return decision;
      list.splice(0, list.length, ...appendCombatant(list, c));
      return "added";
    };
    return { list, commit };
  };

  const first = opts.mounted ? mkWidget(opts.mounted) : null;
  const second = opts.secondMounted ? mkWidget(opts.secondMounted) : null;
  const widgets = [first, second].filter((w) => w !== null);

  vi.stubGlobal("window", {
    localStorage: {
      getItem: (k: string) => {
        if (opts.throwOnRead) throw new Error("boom");
        return storage.has(k) ? storage.get(k)! : null;
      },
      setItem: (k: string, v: string) => { storage.set(k, String(v)); },
    },
    dispatchEvent: (e: Event & { defaultPrevented: boolean }) => {
      for (const w of widgets) {
        // Real DOM semantics, and both halves matter here: a listener's
        // exception is REPORTED, not propagated, so dispatch continues to the
        // next listener and any canceled flag already set still stands.
        try {
          handleAddToInitiativeEvent(e, w.commit);
        } catch {
          /* reported to window.onerror in a browser; swallowed here */
        }
      }
      // dispatchEvent returns false only BECAUSE a listener called
      // preventDefault on a cancelable event. Deriving it (rather than
      // hardcoding the answer) is what makes "the handler must consume the
      // event" a thing these tests can actually catch.
      return !e.defaultPrevented;
    },
  });

  // CustomEvent isn't defined in the Node test env. Models just enough of the
  // real thing for the handler under test: a readable `detail` and a
  // preventDefault that dispatchEvent above reads back.
  vi.stubGlobal("CustomEvent", class {
    defaultPrevented = false;
    detail: unknown;
    constructor(public type: string, init?: { detail?: unknown; cancelable?: boolean }) {
      this.detail = init?.detail;
    }
    preventDefault() { this.defaultPrevented = true; }
  });

  return { storage, mounted: first?.list ?? null, secondMounted: second?.list ?? null };
}

/** `confirmDuplicate` is a required key (see AddToInitiativeOptions) — this is
 *  the explicit "add duplicates silently" choice, spelled once here. */
const SILENT = { confirmDuplicate: undefined } as const;

describe("addCombatantToInitiative", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("returns 'full' at the MAX_COMBATANTS cap", () => {
    installWindow({ seed: Array.from({ length: MAX_COMBATANTS }, () => mkMonster()) });
    expect(addCombatantToInitiative(mkMonster(), SILENT)).toBe("full");
  });

  it("hands off to a mounted widget without writing storage", () => {
    const { storage, mounted } = installWindow({ seed: [], mounted: [] });
    expect(addCombatantToInitiative(mkMonster(), SILENT)).toBe("added");
    // The widget owns the write (via its own useLocalStorage); the producer
    // must not also write behind its back.
    expect(storage.get(INITIATIVE_STORAGE_KEY)).toBe(JSON.stringify([]));
    expect(mounted).toHaveLength(1);
  });

  it("falls back to a direct write when nothing consumes the event", () => {
    const { storage } = installWindow({ seed: [] });
    expect(addCombatantToInitiative(mkMonster(), SILENT)).toBe("added");
    expect(JSON.parse(storage.get(INITIATIVE_STORAGE_KEY)!)).toHaveLength(1);
  });

  it("returns 'error' when the list is unreadable and nothing consumes the event", () => {
    installWindow({ throwOnRead: true });
    expect(addCombatantToInitiative(mkMonster(), SILENT)).toBe("error");
  });

  it("relays a mounted widget's refusal instead of assuming 'added'", () => {
    // Round trip through the real handler: the widget refuses at ITS cap, so
    // "the event was consumed" must not be reported to the DM as a success.
    const { mounted } = installWindow({
      seed: [],
      mounted: Array.from({ length: MAX_COMBATANTS }, () => mkMonster()),
    });
    expect(addCombatantToInitiative(mkPlayer("Aragorn"), SILENT)).toBe("full");
    expect(mounted).toHaveLength(MAX_COMBATANTS);
  });

  it("falls back to storage when the mounted widget's commit throws", () => {
    // dispatchEvent reports a listener's exception rather than propagating it,
    // and any canceled flag stands. So consuming the event BEFORE the commit
    // returned would leave `outcome` undefined on a cancelled event, and the
    // producer's `?? "added"` would report an add that never happened. Held
    // back until the commit returns, the throw instead leaves the event
    // unconsumed and the combatant survives via the storage fallback.
    const { storage, mounted } = installWindow({
      seed: [],
      mounted: [],
      throwOnCommit: true,
    });
    expect(addCombatantToInitiative(mkMonster(), SILENT)).toBe("added");
    expect(mounted).toHaveLength(0);
    expect(JSON.parse(storage.get(INITIATIVE_STORAGE_KEY)!)).toHaveLength(1);
  });

  it("lets only the FIRST of two mounted widgets consume a dispatch", () => {
    // Initiative can be placed in two tiles. Both listen on window, so without
    // the handler's defaultPrevented bail the DM is prompted once per tile.
    const { mounted, secondMounted } = installWindow({
      seed: [],
      mounted: [mkPlayer("Aragorn")],
      secondMounted: [mkPlayer("Aragorn")],
    });
    let asked = 0;
    const result = addCombatantToInitiative(mkPlayer("Aragorn"), {
      confirmDuplicate: () => { asked++; return true; },
    });
    expect(result).toBe("added");
    expect(asked).toBe(1);
    expect(mounted).toHaveLength(2);
    expect(secondMounted).toHaveLength(1);
  });

  it("does not let a second widget overwrite the first's 'cancelled'", () => {
    // The second widget's list is empty, so IT sees no duplicate and would
    // answer "added" — clobbering the decline the DM actually gave.
    const { mounted, secondMounted } = installWindow({
      seed: [],
      mounted: [mkPlayer("Aragorn")],
      secondMounted: [],
    });
    const result = addCombatantToInitiative(mkPlayer("Aragorn"), {
      confirmDuplicate: () => false,
    });
    expect(result).toBe("cancelled");
    expect(mounted).toHaveLength(1);
    expect(secondMounted).toHaveLength(0);
  });

  it("relays a mounted widget's 'cancelled', running the confirm against ITS list", () => {
    // The duplicate is only in the widget's in-memory list — storage is empty.
    // The confirm must still fire, and its decline must reach the caller.
    const { storage, mounted } = installWindow({
      seed: [],
      mounted: [mkPlayer("Aragorn", 18)],
    });
    const seen: Combatant[] = [];
    const result = addCombatantToInitiative(mkPlayer("Aragorn", 4), {
      confirmDuplicate: (existing) => { seen.push(existing); return false; },
    });
    expect(result).toBe("cancelled");
    expect(seen.map((c) => c.initiative)).toEqual([18]);
    expect(mounted).toHaveLength(1);
    expect(storage.get(INITIATIVE_STORAGE_KEY)).toBe(JSON.stringify([]));
  });

  it("still consults the mounted widget when storage is unreadable", () => {
    // Regression: the duplicate/cap checks used to be decided against a storage
    // read taken BEFORE the dispatch, so a throwing getItem (private mode /
    // disabled storage) skipped them silently and the add succeeded anyway.
    // The mounted widget's in-memory list is the authority — storage never
    // needs to be read on this path at all.
    const { mounted } = installWindow({
      throwOnRead: true,
      mounted: [mkPlayer("Aragorn")],
    });
    const result = addCombatantToInitiative(mkPlayer("Aragorn"), {
      confirmDuplicate: () => false,
    });
    expect(result).toBe("cancelled");
    expect(mounted).toHaveLength(1);
  });

  it("accepts a duplicate through a mounted widget when the DM confirms", () => {
    const { mounted } = installWindow({ seed: [], mounted: [mkPlayer("Aragorn")] });
    const result = addCombatantToInitiative(mkPlayer("Aragorn"), {
      confirmDuplicate: () => true,
    });
    expect(result).toBe("added");
    expect(mounted).toHaveLength(2);
  });

  it("returns 'cancelled' and writes nothing when the DM declines a duplicate player", () => {
    const { storage } = installWindow({ seed: [mkPlayer("Aragorn")] });
    const before = storage.get(INITIATIVE_STORAGE_KEY);
    const result = addCombatantToInitiative(mkPlayer("Aragorn"), {
      confirmDuplicate: () => false,
    });
    expect(result).toBe("cancelled");
    expect(storage.get(INITIATIVE_STORAGE_KEY)).toBe(before);
  });

  it("adds the duplicate player when the DM accepts", () => {
    const { storage } = installWindow({ seed: [mkPlayer("Aragorn")] });
    const result = addCombatantToInitiative(mkPlayer("Aragorn"), {
      confirmDuplicate: () => true,
    });
    expect(result).toBe("added");
    expect(JSON.parse(storage.get(INITIATIVE_STORAGE_KEY)!)).toHaveLength(2);
  });

  it("hands the confirm the EXISTING combatant, so the prompt can name its roll", () => {
    installWindow({ seed: [mkPlayer("Aragorn", 18)] });
    const seen: Combatant[] = [];
    addCombatantToInitiative(mkPlayer("Aragorn", 4), {
      confirmDuplicate: (existing) => { seen.push(existing); return true; },
    });
    expect(seen).toHaveLength(1);
    expect(seen[0]!.initiative).toBe(18);
  });

  it("adds a duplicate player silently when confirmDuplicate is explicitly undefined", () => {
    const { storage } = installWindow({ seed: [mkPlayer("Aragorn")] });
    expect(addCombatantToInitiative(mkPlayer("Aragorn"), SILENT)).toBe("added");
    expect(JSON.parse(storage.get(INITIATIVE_STORAGE_KEY)!)).toHaveLength(2);
  });

  it("refuses at the cap without asking about the duplicate", () => {
    const seed = Array.from({ length: MAX_COMBATANTS }, () => mkPlayer("Aragorn"));
    installWindow({ seed });
    let asked = false;
    const result = addCombatantToInitiative(mkPlayer("Aragorn"), {
      confirmDuplicate: () => { asked = true; return true; },
    });
    expect(result).toBe("full");
    expect(asked).toBe(false);
  });

  it("never asks about a monster, however many share the name", () => {
    const { storage } = installWindow({ seed: [mkMonster("Goblin")] });
    let asked = false;
    const result = addCombatantToInitiative(mkMonster("Goblin"), {
      confirmDuplicate: () => { asked = true; return false; },
    });
    expect(result).toBe("added");
    expect(asked).toBe(false);
    expect(JSON.parse(storage.get(INITIATIVE_STORAGE_KEY)!)).toHaveLength(2);
  });
});

describe("handleAddToInitiativeEvent", () => {
  // The consumer half in isolation. The round-trip tests above cover it paired
  // with its producer; these pin the wire protocol itself.
  const mkEvent = (detail: unknown) => {
    let defaultPrevented = false;
    return {
      detail,
      get defaultPrevented() { return defaultPrevented; },
      preventDefault() { defaultPrevented = true; },
    } as unknown as Event;
  };

  it("consumes the event and reports the commit's outcome", () => {
    const e = mkEvent({ combatant: mkPlayer("Aragorn") });
    handleAddToInitiativeEvent(e, () => "cancelled");
    expect(e.defaultPrevented).toBe(true);
    expect((e as CustomEvent).detail.outcome).toBe("cancelled");
  });

  it("forwards the combatant and the confirm callback to the commit", () => {
    const combatant = mkPlayer("Aragorn");
    const confirmDuplicate = () => false;
    const seen: unknown[] = [];
    handleAddToInitiativeEvent(mkEvent({ combatant, confirmDuplicate }), (c, fn) => {
      seen.push(c, fn);
      return "added";
    });
    expect(seen).toEqual([combatant, confirmDuplicate]);
  });

  it("ignores a malformed dispatch without consuming it", () => {
    // Not consuming is what lets the producer fall back to its storage write
    // rather than the add vanishing.
    for (const detail of [undefined, {}, { combatant: null }]) {
      const e = mkEvent(detail);
      let called = false;
      handleAddToInitiativeEvent(e, () => { called = true; return "added"; });
      expect(e.defaultPrevented).toBe(false);
      expect(called).toBe(false);
    }
  });

  it("ignores an event another consumer already took", () => {
    // Two Initiative tiles means two listeners on one dispatch. First one wins;
    // the rest must not re-run the commit (a second confirm prompt) or
    // overwrite the outcome the first wrote.
    const e = mkEvent({ combatant: mkPlayer("Aragorn"), outcome: "cancelled" });
    e.preventDefault();
    let called = false;
    handleAddToInitiativeEvent(e, () => { called = true; return "added"; });
    expect(called).toBe(false);
    expect((e as CustomEvent).detail.outcome).toBe("cancelled");
  });

  it("does not consume the event when the commit throws", () => {
    // Leaving it unconsumed sends the producer to its storage fallback. Consuming
    // first would strand it with `outcome: undefined`, which it reads as "added".
    const e = mkEvent({ combatant: mkPlayer("Aragorn") });
    expect(() =>
      handleAddToInitiativeEvent(e, () => { throw new Error("boom"); }),
    ).toThrow("boom");
    expect(e.defaultPrevented).toBe(false);
    expect((e as CustomEvent).detail.outcome).toBeUndefined();
  });
});

describe("decideInitiativeAdd", () => {
  // The shared rule both authorities apply: the mounted widget against its
  // in-memory list, and addCombatantToInitiative's fallback against storage.
  it("allows an add into a list with room", () => {
    expect(decideInitiativeAdd([], mkPlayer("Aragorn"))).toBe("added");
  });

  it("refuses at the cap", () => {
    const list = Array.from({ length: MAX_COMBATANTS }, () => mkMonster());
    expect(decideInitiativeAdd(list, mkMonster())).toBe("full");
  });

  it("checks the cap before the duplicate confirm", () => {
    const list = Array.from({ length: MAX_COMBATANTS }, () => mkPlayer("Aragorn"));
    let asked = false;
    const decision = decideInitiativeAdd(list, mkPlayer("Aragorn"), () => {
      asked = true;
      return true;
    });
    expect(decision).toBe("full");
    expect(asked).toBe(false);
  });

  it("returns 'cancelled' when the confirm declines a duplicate player", () => {
    const decision = decideInitiativeAdd([mkPlayer("Aragorn")], mkPlayer("Aragorn"), () => false);
    expect(decision).toBe("cancelled");
  });

  it("returns 'added' when the confirm accepts a duplicate player", () => {
    const decision = decideInitiativeAdd([mkPlayer("Aragorn")], mkPlayer("Aragorn"), () => true);
    expect(decision).toBe("added");
  });

  it("adds a duplicate without asking when no confirm is supplied", () => {
    expect(decideInitiativeAdd([mkPlayer("Aragorn")], mkPlayer("Aragorn"))).toBe("added");
  });

  it("never asks about a monster", () => {
    let asked = false;
    const decision = decideInitiativeAdd([mkMonster("Goblin")], mkMonster("Goblin"), () => {
      asked = true;
      return false;
    });
    expect(decision).toBe("added");
    expect(asked).toBe(false);
  });
});

describe("findDuplicatePlayer", () => {
  it("finds an existing player with the same name", () => {
    const existing = mkPlayer("Aragorn");
    expect(findDuplicatePlayer([existing], mkPlayer("Aragorn"))).toBe(existing);
  });

  it("matches case- and whitespace-insensitively, like the party roster does", () => {
    const existing = mkPlayer("Aragorn");
    expect(findDuplicatePlayer([existing], mkPlayer("  aRaGoRn "))).toBe(existing);
  });

  it("ignores the incoming combatant when it is a monster", () => {
    // Five goblins in one fight is routine — monsters must never warn.
    expect(findDuplicatePlayer([mkMonster("Goblin")], mkMonster("Goblin"))).toBeUndefined();
  });

  it("does not match a monster sharing a player's name", () => {
    // A doppelganger of Aragorn is a deliberate DM move, not a mistake.
    expect(findDuplicatePlayer([mkMonster("Aragorn")], mkPlayer("Aragorn"))).toBeUndefined();
  });

  it("returns undefined on an empty list or a non-match", () => {
    expect(findDuplicatePlayer([], mkPlayer("Aragorn"))).toBeUndefined();
    expect(findDuplicatePlayer([mkPlayer("Legolas")], mkPlayer("Aragorn"))).toBeUndefined();
  });

  it("returns the first match when several players share a name", () => {
    const first = mkPlayer("Aragorn", 18);
    const second = mkPlayer("Aragorn", 4);
    expect(findDuplicatePlayer([first, second], mkPlayer("Aragorn"))).toBe(first);
  });
});

describe("duplicatePlayerMessage", () => {
  it("names the clash and its current roll", () => {
    const msg = duplicatePlayerMessage(mkPlayer("Aragorn", 18));
    expect(msg).toContain("Aragorn");
    // The existing roll is what tells the DM whether this is a mistake or a re-roll.
    expect(msg).toContain("18");
  });
});
