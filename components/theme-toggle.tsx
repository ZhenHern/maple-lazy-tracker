"use client";

import { useEffect, useSyncExternalStore } from "react";
import { THEME_KEY } from "@/lib/site";
import { useLocalStorage } from "@/lib/use-local-storage";

// The day / night switch. The choice lives in localStorage; until the visitor
// makes one, the page follows their device's light or dark setting.
//
// The colours themselves are plain CSS: globals.css restyles the page when
// <html> carries data-theme="dark". A tiny script in app/layout.tsx sets that
// attribute before the first paint, so a night-mode visitor never sees a
// white flash; this component keeps it in step afterwards.

type Theme = "light" | "dark";

function sanitizeTheme(stored: unknown): Theme | null {
  return stored === "dark" || stored === "light" ? stored : null;
}

const DARK_QUERY = "(prefers-color-scheme: dark)";

function subscribeToDevice(onChange: () => void): () => void {
  const media = window.matchMedia(DARK_QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

export function ThemeToggle() {
  const [chosen, setChosen] = useLocalStorage(THEME_KEY, sanitizeTheme);
  const deviceIsDark = useSyncExternalStore(
    subscribeToDevice,
    () => window.matchMedia(DARK_QUERY).matches,
    // The server cannot know the device, so it renders the day version.
    () => false,
  );
  const theme: Theme = chosen ?? (deviceIsDark ? "dark" : "light");

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const next: Theme = theme === "dark" ? "light" : "dark";
  return (
    <button
      type="button"
      className="filter nav-link theme-toggle"
      onClick={() => setChosen(next)}
      aria-label={`Switch to ${next === "dark" ? "night" : "day"} mode`}
      title={`Switch to ${next === "dark" ? "night" : "day"} mode`}
    >
      <span aria-hidden="true">{theme === "dark" ? "☀" : "☾"}</span>
      <span className="max-sm:sr-only">{theme === "dark" ? "Day" : "Night"}</span>
    </button>
  );
}
