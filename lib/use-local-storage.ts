"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";

// "storage" only fires in other tabs, so same-tab writes announce themselves.
const CHANGE_EVENT = "lazy-tracker:storage";

function subscribe(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

// Storage can throw (private mode, blocked site data), so every access is guarded.
function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

/**
 * A value persisted in localStorage. `sanitize` receives whatever was stored
 * (or undefined) and must return a valid value; pass a stable function.
 * The server and the first client render both see `sanitize(undefined)`.
 */
export function useLocalStorage<T>(
  key: string,
  sanitize: (stored: unknown) => T,
): [T, (next: T) => void] {
  const raw = useSyncExternalStore(
    subscribe,
    () => read(key),
    () => null,
  );

  const value = useMemo(() => {
    if (raw === null) return sanitize(undefined);
    try {
      return sanitize(JSON.parse(raw));
    } catch {
      return sanitize(undefined);
    }
  }, [raw, sanitize]);

  const setValue = useCallback(
    (next: T) => {
      try {
        window.localStorage.setItem(key, JSON.stringify(next));
      } catch {
        // Nothing to do: the choice simply will not persist.
      }
      window.dispatchEvent(new Event(CHANGE_EVENT));
    },
    [key],
  );

  return [value, setValue];
}
