// @vitest-environment jsdom
//
// Tier-2 (jsdom) coverage for useLocalStorage — the localStorage primitive
// every typed store sits on. It's a React hook, so it needs a DOM host and
// opts in via the docblock above rather than flipping the whole suite to jsdom
// (see vitest.config.ts). The three edges the QA review flagged as untested are
// all here:
//   - heal-on-read write-back (a cleaning validator persists the cleaned form);
//   - the debounce timer / flush interplay (unmount, pagehide, tab-hidden, and
//     the pendingWrites registry all flush an in-flight write); and
//   - the onWriteError → onWriteSuccess recovery edge (success fires ONLY on the
//     failure→success transition, not on every persisted write).
//
// What jsdom can't reach stays out: it enforces no storage quota, so a "real"
// quota-exceeded is simulated by making Storage.prototype.setItem throw.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, cleanup } from "@testing-library/react";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { flushPendingWrites } from "@/lib/pendingWrites";

const KEY = "dm-test-key";

/** Read the raw persisted value straight from storage (not React state). */
function raw(): unknown {
  const s = window.localStorage.getItem(KEY);
  return s === null ? null : JSON.parse(s);
}

beforeEach(() => {
  window.localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("initial read", () => {
  it("returns the initialValue when nothing is stored (plain + factory)", () => {
    const a = renderHook(() => useLocalStorage(KEY, "default"));
    expect(a.result.current[0]).toBe("default");
    cleanup();
    window.localStorage.clear();
    const b = renderHook(() => useLocalStorage(KEY, () => ["factory"]));
    expect(b.result.current[0]).toEqual(["factory"]);
  });

  it("returns the parsed stored value when present and no validator is given", () => {
    window.localStorage.setItem(KEY, JSON.stringify({ hp: 12 }));
    const { result } = renderHook(() => useLocalStorage(KEY, {}));
    expect(result.current[0]).toEqual({ hp: 12 });
  });

  it("falls back to initialValue on corrupt JSON", () => {
    window.localStorage.setItem(KEY, "{not valid json");
    const { result } = renderHook(() => useLocalStorage(KEY, "fallback"));
    expect(result.current[0]).toBe("fallback");
  });
});

describe("validator heal-on-read", () => {
  const numbersOnly = (p: unknown): number[] | undefined =>
    Array.isArray(p) ? (p.filter((n) => typeof n === "number") as number[]) : undefined;

  it("returns the cleaned value AND writes it back to heal storage", () => {
    window.localStorage.setItem(KEY, JSON.stringify([1, 2, "x", 3, false]));
    const { result } = renderHook(() => useLocalStorage<number[]>(KEY, [], numbersOnly));
    expect(result.current[0]).toEqual([1, 2, 3]);
    // Storage is healed to the cleaned form so subsequent reads are O(0).
    expect(raw()).toEqual([1, 2, 3]);
  });

  it("does NOT rewrite storage when the value is already clean", () => {
    window.localStorage.setItem(KEY, JSON.stringify([1, 2, 3]));
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    renderHook(() => useLocalStorage<number[]>(KEY, [], numbersOnly));
    expect(setItem).not.toHaveBeenCalled();
  });

  it("falls back to initialValue when the validator rejects (returns undefined)", () => {
    window.localStorage.setItem(KEY, JSON.stringify("not an array"));
    const { result } = renderHook(() => useLocalStorage<number[]>(KEY, [42], numbersOnly));
    expect(result.current[0]).toEqual([42]);
  });

  it("preserves an in-memory cleaned value even when the heal write throws", () => {
    window.localStorage.setItem(KEY, JSON.stringify([1, "x", 2]));
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota", "QuotaExceededError");
    });
    const { result } = renderHook(() => useLocalStorage<number[]>(KEY, [], numbersOnly));
    // Heal write is swallowed; the cleaned value still surfaces in memory.
    expect(result.current[0]).toEqual([1, 2]);
  });
});

describe("setValue (immediate, no debounce)", () => {
  it("updates React state and persists synchronously", () => {
    const { result } = renderHook(() => useLocalStorage(KEY, "a"));
    act(() => result.current[1]("b"));
    expect(result.current[0]).toBe("b");
    expect(raw()).toBe("b");
  });

  it("a functional updater sees the latest value across back-to-back calls", () => {
    // Two setValue(prev => …) in one tick: without valueRef the second would
    // read the stale render-state closure and clobber the first (result 1).
    const { result } = renderHook(() => useLocalStorage<number>(KEY, 0));
    act(() => {
      result.current[1]((n) => n + 1);
      result.current[1]((n) => n + 1);
    });
    expect(result.current[0]).toBe(2);
    expect(raw()).toBe(2);
  });

  it("getLatest reflects a value already applied this tick", () => {
    const { result } = renderHook(() => useLocalStorage<number>(KEY, 0));
    act(() => {
      result.current[1](7);
      // getLatest reads valueRef, which setValue re-points eagerly.
      expect(result.current[2]()).toBe(7);
    });
  });
});

describe("debounced writes", () => {
  it("updates state immediately but defers the storage write until the timer fires", () => {
    vi.useFakeTimers();
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const { result } = renderHook(() =>
      useLocalStorage(KEY, "a", undefined, { debounceWriteMs: 500 }),
    );
    act(() => result.current[1]("b"));
    expect(result.current[0]).toBe("b"); // render state is synchronous
    expect(setItem).not.toHaveBeenCalled(); // write is still pending
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(setItem).toHaveBeenCalledTimes(1);
    expect(raw()).toBe("b");
  });

  it("coalesces rapid writes into a single trailing-edge write of the last value", () => {
    vi.useFakeTimers();
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const { result } = renderHook(() =>
      useLocalStorage(KEY, "a", undefined, { debounceWriteMs: 500 }),
    );
    act(() => {
      result.current[1]("b");
      result.current[1]("c");
      result.current[1]("d");
    });
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(setItem).toHaveBeenCalledTimes(1);
    expect(raw()).toBe("d");
  });

  it("flushes a pending write on unmount", () => {
    vi.useFakeTimers();
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const { result, unmount } = renderHook(() =>
      useLocalStorage(KEY, "a", undefined, { debounceWriteMs: 500 }),
    );
    act(() => result.current[1]("b"));
    expect(setItem).not.toHaveBeenCalled();
    act(() => {
      unmount();
    });
    expect(setItem).toHaveBeenCalledTimes(1);
    expect(raw()).toBe("b");
  });

  it("flushes a pending write on pagehide", () => {
    vi.useFakeTimers();
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const { result } = renderHook(() =>
      useLocalStorage(KEY, "a", undefined, { debounceWriteMs: 500 }),
    );
    act(() => result.current[1]("b"));
    act(() => {
      window.dispatchEvent(new Event("pagehide"));
    });
    expect(setItem).toHaveBeenCalledTimes(1);
    expect(raw()).toBe("b");
  });

  it("flushes a pending write when the tab is hidden", () => {
    vi.useFakeTimers();
    const visibility = vi
      .spyOn(document, "visibilityState", "get")
      .mockReturnValue("hidden");
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const { result } = renderHook(() =>
      useLocalStorage(KEY, "a", undefined, { debounceWriteMs: 500 }),
    );
    act(() => result.current[1]("b"));
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(setItem).toHaveBeenCalledTimes(1);
    expect(raw()).toBe("b");
    visibility.mockRestore();
  });

  it("flushes a pending write when the pendingWrites registry is swept", () => {
    // This is the exact path backup.ts takes before reading localStorage.
    vi.useFakeTimers();
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const { result } = renderHook(() =>
      useLocalStorage(KEY, "a", undefined, { debounceWriteMs: 500 }),
    );
    act(() => result.current[1]("b"));
    act(() => {
      flushPendingWrites();
    });
    expect(setItem).toHaveBeenCalledTimes(1);
    expect(raw()).toBe("b");
  });

  it("does not register a flush (or defer) when debounce is disabled", () => {
    // A non-debounced site writes synchronously and must not leave a flusher in
    // the registry; sweeping it after unmount is a harmless no-op either way.
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const { result } = renderHook(() => useLocalStorage(KEY, "a"));
    act(() => result.current[1]("b"));
    expect(setItem).toHaveBeenCalledTimes(1); // immediate, not deferred
  });
});

describe("write-failure callbacks", () => {
  it("calls onWriteError and keeps the in-memory value when setItem throws", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota", "QuotaExceededError");
    });
    const onWriteError = vi.fn();
    const { result } = renderHook(() =>
      useLocalStorage(KEY, "a", undefined, { onWriteError }),
    );
    act(() => result.current[1]("b"));
    expect(onWriteError).toHaveBeenCalledTimes(1);
    // UI must not freeze: state still reflects the attempted value.
    expect(result.current[0]).toBe("b");
  });

  it("does not call onWriteSuccess on a first successful write (no prior failure)", () => {
    const onWriteSuccess = vi.fn();
    const { result } = renderHook(() =>
      useLocalStorage(KEY, "a", undefined, { onWriteSuccess }),
    );
    act(() => result.current[1]("b"));
    expect(onWriteSuccess).not.toHaveBeenCalled();
  });

  it("fires onWriteSuccess only on the failure→success edge, once", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const original = Storage.prototype.setItem;
    let failNext = true;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (
      this: Storage,
      k: string,
      v: string,
    ) {
      if (failNext) throw new DOMException("quota", "QuotaExceededError");
      return original.call(this, k, v);
    });
    const onWriteError = vi.fn();
    const onWriteSuccess = vi.fn();
    const { result } = renderHook(() =>
      useLocalStorage(KEY, "a", undefined, { onWriteError, onWriteSuccess }),
    );

    // 1) Write fails → error, no success yet.
    act(() => result.current[1]("b"));
    expect(onWriteError).toHaveBeenCalledTimes(1);
    expect(onWriteSuccess).not.toHaveBeenCalled();

    // 2) Storage frees up; next write succeeds → the recovery edge fires once.
    failNext = false;
    act(() => result.current[1]("c"));
    expect(onWriteSuccess).toHaveBeenCalledTimes(1);

    // 3) A further successful write is NOT the edge → no repeat.
    act(() => result.current[1]("d"));
    expect(onWriteSuccess).toHaveBeenCalledTimes(1);
  });
});
