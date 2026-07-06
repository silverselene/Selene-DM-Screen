// Registry of flush callbacks for debounced localStorage writes
// (`useLocalStorage`'s `debounceWriteMs` option).
//
// Why this exists: the backup surfaces in `backup.ts` read
// `window.localStorage` directly, not React state. A write still sitting
// in a debounce timer (e.g. the Notepad's last keystrokes) is invisible
// to them, so without a synchronous flush:
//   - an export taken within the debounce window silently omits the
//     newest text — the one failure a *backup* must not have; and
//   - an import's prepare-time snapshot misses it too, so the value is
//     neither restored on rollback nor represented in `currentBytes`.
// `backup.ts` calls `flushPendingWrites()` before every sweep/snapshot.
//
// Kept as its own module (rather than exported from the hook) so
// `backup.ts` and its Node-environment tests don't have to import the
// React hook module to reach it.

const flushers = new Set<() => void>();

/** Register a flush callback for a pending-capable write site. Returns
 *  the matching unregister function (call it on unmount). */
export function registerPendingWrite(flush: () => void): () => void {
  flushers.add(flush);
  return () => flushers.delete(flush);
}

/** Synchronously flush every pending debounced localStorage write. Safe
 *  to call when nothing is pending (each flush is a no-op then). */
export function flushPendingWrites(): void {
  for (const flush of flushers) flush();
}
