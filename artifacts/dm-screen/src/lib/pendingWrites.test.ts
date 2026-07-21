// Tier-1 (Node env) coverage for the debounced-write flush registry. backup.ts
// calls flushPendingWrites() before every localStorage sweep so an in-flight
// debounced write (the Notepad's last keystrokes) can't be omitted from an
// export or an import snapshot — the one failure a backup must not have. That
// wiring is exercised indirectly by backup.test.ts / useLocalStorage.test.tsx;
// this pins the registry's own contract (register → flush → unregister) in
// isolation, in the fast Node env, with no React or DOM.
import { describe, it, expect, vi, afterEach } from "vitest";
import { registerPendingWrite, flushPendingWrites } from "@/lib/pendingWrites";

// The registry is a module-level singleton shared across tests, so every test
// unregisters everything it adds to keep the set clean for the next one.
const cleanups: Array<() => void> = [];
function track(unregister: () => void): () => void {
  cleanups.push(unregister);
  return unregister;
}
afterEach(() => {
  while (cleanups.length) cleanups.pop()!();
});

describe("pendingWrites registry", () => {
  it("invokes a registered flush callback on flushPendingWrites", () => {
    const flush = vi.fn();
    track(registerPendingWrite(flush));
    flushPendingWrites();
    expect(flush).toHaveBeenCalledTimes(1);
  });

  it("invokes every registered flush, not just one", () => {
    const a = vi.fn();
    const b = vi.fn();
    track(registerPendingWrite(a));
    track(registerPendingWrite(b));
    flushPendingWrites();
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });

  it("stops invoking a callback after its unregister runs", () => {
    const flush = vi.fn();
    const unregister = registerPendingWrite(flush);
    unregister();
    flushPendingWrites();
    expect(flush).not.toHaveBeenCalled();
  });

  it("is a no-op (does not throw) when nothing is registered", () => {
    expect(() => flushPendingWrites()).not.toThrow();
  });

  it("double-unregister is safe", () => {
    const flush = vi.fn();
    const unregister = registerPendingWrite(flush);
    unregister();
    expect(() => unregister()).not.toThrow();
    flushPendingWrites();
    expect(flush).not.toHaveBeenCalled();
  });

  it("can be flushed repeatedly (each flush re-runs the live callbacks)", () => {
    const flush = vi.fn();
    track(registerPendingWrite(flush));
    flushPendingWrites();
    flushPendingWrites();
    expect(flush).toHaveBeenCalledTimes(2);
  });
});
