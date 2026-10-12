"use client";

import { useSyncExternalStore } from "react";

const MINUTE = 60_000;

function subscribe(onChange: () => void): () => void {
  const timer = window.setInterval(onChange, MINUTE / 2);
  return () => window.clearInterval(timer);
}

// Rounded to the minute so the value is stable between renders.
function currentMinute(): number {
  return Math.floor(Date.now() / MINUTE) * MINUTE;
}

/**
 * The current time in ms, updated every minute. Null on the server and during
 * hydration, because the server's clock must not be baked into the HTML.
 */
export function useNow(): number | null {
  return useSyncExternalStore(subscribe, currentMinute, () => null);
}
