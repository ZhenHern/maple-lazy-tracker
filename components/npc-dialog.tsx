"use client";

import { useEffect, useRef, useState } from "react";
import { PixelSprite } from "./pixel-sprite";

const OUCH = "Ow, ow! Stop that. I'm the one saving you from dailies, remember?";

interface Hit {
  id: number;
  text: string;
  /** Horizontal offset in px so numbers do not stack exactly. */
  offset: number;
}

// Types the text out one letter at a time, like an in-game NPC. The full text
// is always in the DOM (the untyped part is invisible), so the box never
// changes size and screen readers get the whole line at once.
function Typewriter({ text }: { text: string }) {
  const [shown, setShown] = useState(0);

  useEffect(() => {
    const instant = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timer = window.setInterval(() => {
      setShown((count) => Math.min(text.length, instant ? text.length : count + 2));
    }, 24);
    return () => window.clearInterval(timer);
  }, [text]);

  return (
    <p className="npc-text" onClick={() => setShown(text.length)}>
      <span className="sr-only">{text}</span>
      <span aria-hidden="true">
        {text.slice(0, shown)}
        <span className="invisible">{text.slice(shown)}</span>
      </span>
    </p>
  );
}

interface NpcDialogProps {
  /** What the NPC can say, most useful first. */
  lines: string[];
  onShowMustDo: () => void;
}

export function NpcDialog({ lines, onShowMustDo }: NpcDialogProps) {
  const [index, setIndex] = useState(0);
  const [pokes, setPokes] = useState(0);
  const [hits, setHits] = useState<Hit[]>([]);
  const nextHitId = useRef(0);

  const line = pokes > 0 && pokes % 5 === 0 ? OUCH : lines[index % lines.length];

  function poke() {
    const critical = Math.random() < 0.2;
    const damage = Math.floor(Math.random() * 900 + 100) * (critical ? 3 : 1);
    nextHitId.current += 1;
    const hit: Hit = {
      id: nextHitId.current,
      text: critical ? `${damage}!` : String(damage),
      offset: Math.round(Math.random() * 40 - 20),
    };
    setHits((current) => [...current, hit]);
    setPokes((count) => count + 1);
  }

  return (
    <section className="window" aria-label="Summary from Lazy Shroom">
      <div className="npc">
        <button
          type="button"
          className="npc-sprite"
          onClick={poke}
          aria-label="Poke Lazy Shroom"
          title="Poke me!"
        >
          {/* Changing the key remounts the sprite, which restarts the hop. */}
          <span key={pokes} className={pokes > 0 ? "hop" : "bob"}>
            <PixelSprite name="shroom" className="w-20 sm:w-24" />
          </span>
          {hits.map((hit) => (
            <span
              key={hit.id}
              className="dmg"
              style={{ marginLeft: hit.offset }}
              onAnimationEnd={() =>
                setHits((current) => current.filter((each) => each.id !== hit.id))
              }
              aria-hidden="true"
            >
              {hit.text}
            </span>
          ))}
          <span className="npc-name">Lazy Shroom</span>
        </button>

        <div className="grid min-w-0 gap-3">
          <Typewriter key={line} text={line} />
          <div className="flex flex-wrap justify-end gap-2">
            {lines.length > 1 && (
              <button type="button" className="btn" onClick={() => setIndex((i) => i + 1)}>
                Next ▸
              </button>
            )}
            <button type="button" className="btn btn-go" onClick={onShowMustDo}>
              Show Must Do
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
