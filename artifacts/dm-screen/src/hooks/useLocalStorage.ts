import { useCallback, useEffect, useRef, useState } from "react";
import { registerPendingWrite } from "@/lib/pendingWrites";

interface UseLocalStorageOptions {
  /** Debounce `setItem` by this many ms (trailing edge). React state still
   *  updates synchronously — only the storage write is deferred — so use
   *  this for keys written on every keystroke over potentially large
   *  values (the Notepad's full note is re-serialized per keypress
   *  otherwise). Pending writes are flushed on unmount, `pagehide`, when
   *  the tab is hidden, and — via the `pendingWrites` registry — before
   *  the backup export/import sweeps in `backup.ts` read localStorage, so
   *  neither a closed tab nor a mid-debounce backup can miss the newest
   *  keystrokes. */
  debounceWriteMs?: number;
  /** Called when a `setItem` throws (quota exceeded / private mode), after the
   *  failure is logged. Lets a widget surface "your data isn't being saved" in
   *  its UI instead of the loss being console-only. Read through a ref on each
   *  write, so an inline closure here doesn't destabilize the returned setter. */
  onWriteError?: (err: unknown) => void;
  /** Called after a `setItem` SUCCEEDS following a prior failure — the
   *  error→success recovery edge only, not every write. Lets a widget clear the
   *  "your data isn't being saved" warning once storage frees up (the DM deletes
   *  a backup, closes the Notepad) instead of leaving it stuck. Read through a
   *  ref, same as `onWriteError`. */
  onWriteSuccess?: () => void;
}

/**
 * Persist React state in `localStorage` under a versioned key.
 *
 * Pass an optional `validator` to defend against malformed stored values
 * (DevTools edits, service-worker cache mismatches, future write bugs).
 * The validator runs on the parsed value at mount time and must return
 * the cleaned `T` (which is written back to storage to heal it) or
 * `undefined` to fall back to `initialValue`. `undefined` (not `null`)
 * is the rejection sentinel specifically so validators of nullable
 * types can return `null` as a real cleaned value. See
 * `src/lib/backup.ts` for the canonical shape validators
 * (`validateTiles`, `validateCombatants`, `validateBoundedInt`, etc.) —
 * pair each `useLocalStorage` call site with the same validator the
 * backup-import path uses for the same key.
 */
export function useLocalStorage<T>(
  key: string,
  initialValue: T | (() => T),
  validator?: (parsed: unknown) => T | undefined,
  options?: UseLocalStorageOptions,
) {
  const debounceMs = options?.debounceWriteMs ?? 0;
  const onWriteErrorRef = useRef(options?.onWriteError);
  onWriteErrorRef.current = options?.onWriteError;
  const onWriteSuccessRef = useRef(options?.onWriteSuccess);
  onWriteSuccessRef.current = options?.onWriteSuccess;
  // Tracks the last write's outcome so onWriteSuccess fires only on the
  // failure→success edge, not on every persisted keystroke.
  const lastWriteFailedRef = useRef(false);
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = window.localStorage.getItem(key);
      if (item !== null) {
        const parsed: unknown = JSON.parse(item);
        if (!validator) return parsed as T;
        const validated = validator(parsed);
        if (validated !== undefined) {
          // Heal storage: if the validator cleaned the value (e.g.
          // dropped malformed entries), persist the cleaned form so
          // subsequent reads are O(0) work and other tabs see the
          // sanitized state.
          const cleanedString = JSON.stringify(validated);
          if (cleanedString !== item) {
            try {
              window.localStorage.setItem(key, cleanedString);
            } catch {
              /* quota / private mode — keep in-memory cleaned value */
            }
          }
          return validated;
        }
        // Validator rejected — fall through to initialValue.
      }
    } catch {
      // JSON.parse failed — fall through to initialValue.
    }
    return typeof initialValue === "function"
      ? (initialValue as () => T)()
      : initialValue;
  });

  // Mirror `storedValue` so a functional updater always sees the latest
  // value, even when two `setValue(prev => ...)` calls fire back-to-back
  // in the same handler (React hasn't re-rendered between them, so the
  // closure-captured `storedValue` would otherwise be stale and the
  // second call would clobber the first). The effect below re-syncs the
  // ref after any render so a setter outside `setValue` (e.g. a future
  // cross-tab `storage` listener that calls `setStoredValue` directly)
  // can't desync the ref.
  const valueRef = useRef(storedValue);
  useEffect(() => {
    valueRef.current = storedValue;
  });

  // Debounced-write machinery (inert when debounceMs is 0).
  const writeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const writePending = useRef(false);

  const writeNow = useCallback(
    (val: T) => {
      try {
        window.localStorage.setItem(key, JSON.stringify(val));
        if (lastWriteFailedRef.current) {
          lastWriteFailedRef.current = false;
          onWriteSuccessRef.current?.();
        }
      } catch (err) {
        // quota / private mode. In-memory state still updates so the UI
        // doesn't freeze, but log so the failure is visible — silently
        // dropping writes was hiding "an hour of notes are gone on reload"
        // scenarios.
        lastWriteFailedRef.current = true;
        console.error(`useLocalStorage("${key}"): failed to persist`, err);
        onWriteErrorRef.current?.(err);
      }
    },
    [key],
  );

  // Flush a pending debounced write before the value can be lost: tab
  // hidden / navigating away (`pagehide` covers close + refresh +
  // bfcache), unmount (tile cleared / widget swapped), and — via the
  // `pendingWrites` registry — synchronously before a backup export or
  // import snapshot sweeps localStorage.
  useEffect(() => {
    if (debounceMs <= 0) return;
    const flush = () => {
      if (!writePending.current) return;
      if (writeTimer.current) {
        clearTimeout(writeTimer.current);
        writeTimer.current = null;
      }
      writePending.current = false;
      writeNow(valueRef.current);
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };
    const unregister = registerPendingWrite(flush);
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      unregister();
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVisibility);
      flush();
    };
    // key/debounceMs are fixed for a call site; re-subscribing on change
    // would flush against the wrong key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reference-stable across renders (like a `useState` setter), so call sites
  // can safely capture it in `useCallback`/`useEffect` bodies with fixed deps.
  // It only reads refs and the fixed `key`/`debounceMs`, so a stale closure is
  // impossible.
  const setValue = useCallback(
    (value: T | ((val: T) => T)) => {
      const next = value instanceof Function ? value(valueRef.current) : value;
      valueRef.current = next;
      setStoredValue(next);
      if (debounceMs <= 0) {
        writeNow(next);
        return;
      }
      writePending.current = true;
      if (writeTimer.current) clearTimeout(writeTimer.current);
      writeTimer.current = setTimeout(() => {
        writeTimer.current = null;
        writePending.current = false;
        writeNow(valueRef.current);
      }, debounceMs);
    },
    [writeNow, debounceMs],
  );

  // Read the freshest value, including `setValue` calls already applied in this
  // tick that React hasn't re-rendered for yet. The returned `storedValue` is
  // render state and lags those; `valueRef` does not (setValue re-points it
  // eagerly, and the effect above re-syncs it after any render).
  //
  // For rendering, always use `storedValue` — this exists for the case where a
  // non-render caller must DECIDE against the current value and the decision
  // can't live inside a `setValue` updater because it isn't pure (it blocks on
  // a confirm, or its result has to escape). Mirroring the value into a
  // component-level ref instead is the trap this replaces: such a mirror syncs
  // on render, so it silently goes stale for exactly the back-to-back-writes
  // case it was added to handle. Reference-stable, like `setValue`.
  const getLatest = useCallback(() => valueRef.current, []);

  return [storedValue, setValue, getLatest] as const;
}
