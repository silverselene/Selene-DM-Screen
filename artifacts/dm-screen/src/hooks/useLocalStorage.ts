import { useEffect, useRef, useState } from "react";

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
) {
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

  const setValue = (value: T | ((val: T) => T)) => {
    const next = value instanceof Function ? value(valueRef.current) : value;
    valueRef.current = next;
    setStoredValue(next);
    try {
      window.localStorage.setItem(key, JSON.stringify(next));
    } catch (err) {
      // quota / private mode. In-memory state still updates so the UI
      // doesn't freeze, but log so the failure is visible — silently
      // dropping writes was hiding "an hour of notes are gone on reload"
      // scenarios.
      console.error(`useLocalStorage("${key}"): failed to persist`, err);
    }
  };

  return [storedValue, setValue] as const;
}
