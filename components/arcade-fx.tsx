"use client";

import { useEffect, useRef } from "react";
import { playSfx, sanitizeSound, SOUND_KEY, type SfxKind } from "@/lib/sfx";
import { useLocalStorage } from "@/lib/use-local-storage";

// One listener for the whole site that makes buttons, tabs, job cards and quest
// headers feel like game controls: a puff of pixel sparks where you click and,
// when the visitor has switched Sounds on, a short 8-bit blip.
//
// It never reacts to pictures (the thumbnails, reward icons and previews that
// carry information), and it draws nothing for visitors who asked for less
// motion. Sounds are off until the visitor turns them on.

const SPARKS = 7;
const COLORS = ["#ffc531", "#f2711c", "#ffffff", "#6fc94a"];
/** What counts as a control worth reacting to. */
const CONTROLS = "button, a[href], summary";
/** Pictures that show information, and the controls that enlarge them. */
const PICTURES = ".zoom, .zoom-pop, .lightbox, img";

function soundFor(control: Element): SfxKind {
  if (control.closest(".tab")) return "tab";
  if (control.closest(".pick")) return "pick";
  if (control.closest(".btn-go")) return "go";
  if (control.closest("summary")) return "open";
  return "tick";
}

export function ArcadeFx() {
  const [sound] = useLocalStorage(SOUND_KEY, sanitizeSound);
  const layer = useRef<HTMLDivElement>(null);
  // The listeners below are attached once; this keeps them in step with the switch.
  const soundOn = useRef(sound);
  useEffect(() => {
    soundOn.current = sound;
  }, [sound]);

  useEffect(() => {
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)");

    function burst(x: number, y: number) {
      const host = layer.current;
      if (!host) return;
      for (let i = 0; i < SPARKS; i += 1) {
        const spark = document.createElement("span");
        const angle = (Math.PI * 2 * i) / SPARKS + Math.random() * 0.6;
        const distance = 18 + Math.random() * 22;
        spark.className = "fx-spark";
        spark.style.left = `${x}px`;
        spark.style.top = `${y}px`;
        spark.style.background = COLORS[i % COLORS.length];
        spark.style.setProperty("--dx", `${Math.cos(angle) * distance}px`);
        spark.style.setProperty("--dy", `${Math.sin(angle) * distance}px`);
        spark.addEventListener("animationend", () => spark.remove(), { once: true });
        host.appendChild(spark);
      }
    }

    function react(control: Element, x: number, y: number) {
      if (soundOn.current) playSfx(soundFor(control));
      if (!calm.matches) burst(x, y);
    }

    // "click", not "pointerdown": on a touch screen pointerdown fires the moment
    // a finger lands, before the browser knows the touch is a scroll, so every
    // swipe across a quest header would spark. A click only fires for a real tap.
    function onClick(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Element) || target.closest(PICTURES)) return;
      const control = target.closest(CONTROLS);
      if (!control) return;
      // A click with no pointer behind it (detail 0) came from the keyboard, or
      // from the page itself, such as the arrow keys moving between tabs. Its
      // position is meaningless, so the sparks go to the middle of the control.
      if (event.detail === 0) {
        const box = control.getBoundingClientRect();
        react(control, box.left + box.width / 2, box.top + box.height / 2);
      } else {
        react(control, event.clientX, event.clientY);
      }
    }

    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  return <div ref={layer} className="fx-layer" aria-hidden="true" />;
}
