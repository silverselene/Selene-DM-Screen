import { useLayoutEffect, useRef, useState } from "react";

// Some widgets must never run twice at once: AI Chat holds an independent
// in-memory copy of its persisted transcript (dm-ai-chat-v1) per mount, with
// debounced whole-array writes — two live copies silently last-writer-wins
// clobber each other's messages (and the bridge's single turn slot 429s the
// second tile's sends anyway). The selector UI already refuses to place a
// second tile, but tiles also arrive via restored backups, the recent-widgets
// list, and hand-edited storage — so the widget itself needs a mount-time
// guard: whichever instance claims the slot first renders the real widget, any
// other renders an "already open" placeholder, and the slot hands over
// automatically when the owner unmounts.
//
// Module-level state is safe here because a singleton widget's module is
// itself a singleton (one lazy chunk per app), and deliberate: React context
// can't see two mounts that live under separate tiles without threading a
// provider through App, which the CustomEvent-based cross-widget architecture
// avoids.

export interface SingletonSlot {
  /** Claim for `id` if free; returns true when `id` is (now) the owner. */
  claim(id: symbol): boolean;
  /** Release if `id` is the owner (a non-owner release is a no-op). */
  release(id: symbol): void;
  /** Notifies on every ownership change so waiting instances can re-claim. */
  subscribe(listener: () => void): () => void;
}

export function createSingletonSlot(): SingletonSlot {
  let owner: symbol | null = null;
  const listeners = new Set<() => void>();
  // Iterate a copy: a notified listener may claim, which notifies again.
  const notify = () => [...listeners].forEach((l) => l());
  return {
    claim(id) {
      if (owner === null) {
        owner = id;
        notify();
      }
      return owner === id;
    },
    release(id) {
      if (owner === id) {
        owner = null;
        notify();
      }
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/**
 * Bind this component instance to `slot` for its mounted lifetime.
 *
 * "pending" for the first render only. Ownership is decided in a LAYOUT effect,
 * not a passive one: a layout effect still runs only for committed trees (so a
 * discarded concurrent render can't leak a claim) but resolves before the
 * browser paints, so the "pending" frame — which renders nothing, not the
 * placeholder — is never actually painted and a legitimate single mount shows
 * no empty flash. Then "owner" for exactly one live instance and "duplicate"
 * for the rest; a duplicate flips to "owner" automatically when the owner
 * unmounts.
 */
export function useSingletonSlot(slot: SingletonSlot): "pending" | "owner" | "duplicate" {
  const idRef = useRef<symbol | null>(null);
  if (idRef.current === null) idRef.current = Symbol("singleton-widget-instance");
  const [state, setState] = useState<"pending" | "owner" | "duplicate">("pending");
  useLayoutEffect(() => {
    const id = idRef.current!;
    const sync = () => setState(slot.claim(id) ? "owner" : "duplicate");
    // Subscribe before claiming so a release between the two can't be missed.
    const unsubscribe = slot.subscribe(sync);
    sync();
    return () => {
      unsubscribe();
      slot.release(id);
    };
  }, [slot]);
  return state;
}
