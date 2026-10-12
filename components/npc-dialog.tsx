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
      setShown((count) => {
        const next = Math.min(text.length, instant ? text.length : count + 2);
        // Stop ticking once the whole line is out, instead of 40 times a second forever.
        if (next >= text.length) window.clearInterval(timer);
        return next;
      });
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

  // Every fifth poke the Shroom complains, until the visitor moves on.
  const [ouch, setOuch] = useState(false);
  const line = ouch ? OUCH : lines[index % lines.length];

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
    setOuch((pokes + 1) % 5 === 0);
    // The number normally removes itself when its animation ends. With reduced
    // motion there is no animation, so a timer clears it as well.
    window.setTimeout(
      () => setHits((current) => current.filter((each) => each.id !== hit.id)),
      1000,
    );
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
            <PixelSprite name="shroom" className="w-16 sm:w-24" />
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

        <div className="npc-bubble">
          <Typewriter key={line} text={line} />
          <div className="flex flex-wrap items-center justify-end gap-2">
            <span className="npc-dots" aria-hidden="true">
              {lines.map((each, position) => (
                <span key={each} data-on={position === index % lines.length} />
              ))}
            </span>
            {lines.length > 1 && (
              <button type="button" className="btn" onClick={() => {
                  setOuch(false);
                  setIndex((i) => i + 1);
                }}>
                Next ▸
                <span className="sr-only">
                  {" "}
                  (line {(index % lines.length) + 1} of {lines.length})
                </span>
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
