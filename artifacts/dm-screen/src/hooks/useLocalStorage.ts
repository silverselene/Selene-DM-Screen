import { useState } from "react";

/**
 * Persist React state in `localStorage` under a versioned key.
 *
 * Pass an optional `validator` to defend against malformed stored values
 * (DevTools edits, service-worker cache mismatches, future write bugs).
 * The validator runs on the parsed value at mount time and must return
 * the cleaned `T` (which is written back to storage to heal it) or
 * `null` to fall back to `initialValue`. See `src/lib/backup.ts` for the
 * canonical shape validators (`validateTiles`, `validateCombatants`,
 * `validateBoundedInt`, etc.) — pair each `useLocalStorage` call site
 * with the same validator the backup-import path uses for the same key.
 */
export function useLocalStorage<T>(
  key: string,
  initialValue: T | (() => T),
  validator?: (parsed: unknown) => T | null,
) {
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = window.localStorage.getItem(key);
      if (item !== null) {
        const parsed: unknown = JSON.parse(item);
        if (!validator) return parsed as T;
        const validated = validator(parsed);
        if (validated !== null) {
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

  const setValue = (value: T | ((val: T) => T)) => {
    try {
      const valueToStore = value instanceof Function ? value(storedValue) : value;
      setStoredValue(valueToStore);
      window.localStorage.setItem(key, JSON.stringify(valueToStore));
    } catch {
      // ignore (quota / private mode)
    }
  };

  return [storedValue, setValue] as const;
}
