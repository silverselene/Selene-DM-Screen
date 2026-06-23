import { useState } from "react";

export function useLocalStorage<T>(key: string, initialValue: T | (() => T)) {
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = window.localStorage.getItem(key);
      if (item !== null) return JSON.parse(item) as T;
    } catch {
      // fall through to initial value
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
