"use client";

import { useEffect } from "react";
import { useLocalStorage } from "./use-local-storage";

// Remembers when this browser last came by, so the page can mark quests that
// appeared since then. Two times are kept: `previous` (the visit before this
// one, which "new" is measured against) and `current` (this visit).
//
// A visit only counts as a new one after a gap. Otherwise a reload would
// immediately make everything "seen" and the markers would vanish.

const VISIT_GAP = 6 * 3_600_000;

interface Visits {
  previous: number | null;
  current: number | null;
}

function sanitize(stored: unknown): Visits {
  const value = (stored ?? {}) as Partial<Visits>;
  const time = (each: unknown) => (typeof each === "number" && each > 0 ? each : null);
  return { previous: time(value.previous), current: time(value.current) };
}

const KEY = "lazy-tracker:visits";

/**
 * The time of the visitor's previous visit in ms, or null on a first visit
 * and during server rendering (so nothing is marked new until we know).
 */
export function usePreviousVisit(): number | null {
  const [visits, setVisits] = useLocalStorage(KEY, sanitize);

  // An effect runs after the page is on screen, in the browser only. Writing
  // to localStorage is a side effect, so it belongs here and not in rendering.
  //
  // It reads the stored value itself instead of using `visits`: on the very
  // first render the hook still reports "nothing stored" (it must match the
  // server's HTML), and acting on that would overwrite the real record.
  useEffect(() => {
    let stored: Visits;
    try {
      stored = sanitize(JSON.parse(window.localStorage.getItem(KEY) ?? "null"));
    } catch {
      stored = sanitize(null);
    }
    const now = Date.now();
    if (stored.current === null) {
      setVisits({ previous: null, current: now });
    } else if (now - stored.current > VISIT_GAP) {
      setVisits({ previous: stored.current, current: now });
    }
  }, [setVisits]);

  return visits.previous;
}
