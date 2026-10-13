"use client";

import { useEffect, useState } from "react";
import { PixelSprite } from "./pixel-sprite";

// Hidden extras that change nothing about the site. Up, up, down, down, left,
// right, left, right, B, A plays a level-up banner, the way finishing a quest
// does in the game.

const CODE = [
  "ArrowUp",
  "ArrowUp",
  "ArrowDown",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "ArrowLeft",
  "ArrowRight",
  "b",
  "a",
];

const BANNER_MS = 3200;

export function EasterEggs() {
  // A number, not a boolean: each new value remounts the banner so its
  // animation starts again if the code is entered twice.
  const [levelUps, setLevelUps] = useState(0);
  const [showing, setShowing] = useState(false);

  useEffect(() => {
    let progress = 0;
    function onKey(event: KeyboardEvent) {
      // Typing in the search box or the feedback form must not count.
      const target = event.target;
      if (target instanceof Element && target.closest("input, textarea, select, [contenteditable]")) {
        return;
      }
      const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
      progress = key === CODE[progress] ? progress + 1 : key === CODE[0] ? 1 : 0;
      if (progress === CODE.length) {
        progress = 0;
        setLevelUps((count) => count + 1);
        setShowing(true);
      }
    }
    window.addEventListener("keydown", onKey);
    // A hello for anyone who opens the developer tools.
    console.info(
      "%cLazy Shroom: looking under the hood? Try the oldest cheat code in gaming.",
      "color:#f2711c;font-weight:bold",
    );
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!showing) return;
    const timer = window.setTimeout(() => setShowing(false), BANNER_MS);
    return () => window.clearTimeout(timer);
  }, [showing, levelUps]);

  if (!showing) return null;
  return (
    <div key={levelUps} className="level-up" role="status">
      <span className="level-up-rays" aria-hidden="true" />
      <span className="level-up-shroom" aria-hidden="true">
        <PixelSprite name="shroom" className="w-20" />
      </span>
      <strong className="level-up-text">LEVEL UP!</strong>
      <span className="level-up-note">Laziness +1. Nothing else changed.</span>
    </div>
  );
}
