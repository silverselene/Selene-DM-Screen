// Pure-logic coverage for the singleton-widget slot store (tier 1, Node env).
// The React hook on top is a thin subscribe/claim/release binding; the
// ownership rules it relies on are what's pinned here. The mounted behavior
// (second AI Chat tile renders the placeholder, takes over on owner unmount)
// is covered by AIChatWidget.singleton.test.tsx.
import { describe, expect, it, vi } from "vitest";
import { createSingletonSlot } from "./singletonWidget";

describe("createSingletonSlot", () => {
  it("grants the slot to the first claimer and refuses a second", () => {
    const slot = createSingletonSlot();
    const a = Symbol("a");
    const b = Symbol("b");
    expect(slot.claim(a)).toBe(true);
    expect(slot.claim(b)).toBe(false);
  });

  it("re-claiming by the current owner stays true (StrictMode-style re-run)", () => {
    const slot = createSingletonSlot();
    const a = Symbol("a");
    expect(slot.claim(a)).toBe(true);
    expect(slot.claim(a)).toBe(true);
  });

  it("hands the slot to a waiting claimer after the owner releases", () => {
    const slot = createSingletonSlot();
    const a = Symbol("a");
    const b = Symbol("b");
    slot.claim(a);
    expect(slot.claim(b)).toBe(false);
    slot.release(a);
    expect(slot.claim(b)).toBe(true);
  });

  it("ignores a release from a non-owner", () => {
    const slot = createSingletonSlot();
    const a = Symbol("a");
    const b = Symbol("b");
    slot.claim(a);
    slot.release(b); // b never owned it — a must keep the slot
    expect(slot.claim(b)).toBe(false);
    expect(slot.claim(a)).toBe(true);
  });

  it("notifies subscribers on claim and on release, not on no-ops", () => {
    const slot = createSingletonSlot();
    const a = Symbol("a");
    const b = Symbol("b");
    const listener = vi.fn();
    slot.subscribe(listener);

    slot.claim(a);
    expect(listener).toHaveBeenCalledTimes(1);
    slot.claim(b); // refused — no ownership change, no notification
    slot.release(b); // non-owner release — no-op
    expect(listener).toHaveBeenCalledTimes(1);
    slot.release(a);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("a listener that claims inside the release notification wins the handoff", () => {
    // This is the hook's actual takeover path: the duplicate instance's
    // subscription fires when the owner unmounts, and its sync() claims.
    const slot = createSingletonSlot();
    const a = Symbol("a");
    const b = Symbol("b");
    slot.claim(a);
    let bOwns = false;
    slot.subscribe(() => {
      bOwns = slot.claim(b);
    });
    slot.release(a);
    expect(bOwns).toBe(true);
  });

  it("unsubscribe stops notifications", () => {
    const slot = createSingletonSlot();
    const listener = vi.fn();
    const unsubscribe = slot.subscribe(listener);
    unsubscribe();
    slot.claim(Symbol("a"));
    expect(listener).not.toHaveBeenCalled();
  });
});
