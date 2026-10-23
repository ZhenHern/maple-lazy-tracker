"use client";

import { useEffect, useRef } from "react";

// Keyboard shortcuts for the quest log, plus the window that lists them.
// They never fire while the visitor is typing, with Ctrl / Alt / Cmd held (so
// the browser's own shortcuts keep working), or while a dialog is open.

const KEYS: { keys: string[]; what: string }[] = [
  { keys: ["1", "2", "3"], what: "Must Do, If Free, Skip (4 and 5 for Soon and Ended, when shown)" },
  { keys: ["/"], what: "Search the quests" },
  { keys: ["J", "K"], what: "Next and previous quest" },
  { keys: ["Enter"], what: "Open or close the quest in focus" },
  { keys: ["?"], what: "Show this window" },
  { keys: ["Esc"], what: "Close this window" },
];

// Moves keyboard focus to the next or previous quest card in the open tab.
function moveFocus(step: 1 | -1) {
  const heads = [...document.querySelectorAll<HTMLElement>("#quest-panel summary.quest-head")];
  if (heads.length === 0) return;
  const current = heads.findIndex((head) => head.contains(document.activeElement));
  const next =
    current === -1
      ? step === 1
        ? 0
        : heads.length - 1
      : Math.min(heads.length - 1, Math.max(0, current + step));
  // Cards far off screen skip their rendering; scrolling one into view first
  // makes sure it can take focus.
  heads[next].closest("li")?.scrollIntoView({ block: "nearest" });
  heads[next].focus();
}

interface HotkeysProps {
  /** How many tabs are showing: the keys 1 to this number switch to them. */
  tabCount: number;
  /** Called with the tab's position, counting from 1. */
  onTab: (position: number) => void;
}

export function Hotkeys({ tabCount, onTab }: HotkeysProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  // The listener below is attached once; this keeps it pointed at the latest props.
  const latest = useRef({ tabCount, onTab });
  useEffect(() => {
    latest.current = { tabCount, onTab };
  });

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target;
      if (target instanceof Element && target.closest("input, textarea, select, [contenteditable]")) {
        return;
      }
      // An open picture or this window owns the keyboard.
      if (document.querySelector("dialog[open]")) return;

      if (event.key === "?") {
        event.preventDefault();
        dialogRef.current?.showModal();
      } else if (event.key === "/") {
        event.preventDefault();
        document.getElementById("quest-search")?.focus();
      } else if (event.key === "j" || event.key === "k") {
        moveFocus(event.key === "j" ? 1 : -1);
      } else {
        const position = Number(event.key);
        const { tabCount: count, onTab: select } = latest.current;
        if (Number.isInteger(position) && position >= 1 && position <= count) select(position);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      {/* Phones have no keyboard to speak of, so the button is for larger screens. */}
      <button
        type="button"
        className="filter max-sm:hidden"
        aria-haspopup="dialog"
        onClick={() => dialogRef.current?.showModal()}
      >
        Hotkeys <kbd className="key">?</kbd>
      </button>

      <dialog
        ref={dialogRef}
        className="keys-dialog"
        aria-labelledby="keys-title"
        // A click on the dimmed area outside the window closes it.
        onClick={(event) => {
          if (event.target === event.currentTarget) event.currentTarget.close();
        }}
      >
        <div className="window">
          <h2 id="keys-title" className="window-title">
            Hotkeys
          </h2>
          <div className="window-body grid gap-3">
            <dl className="keys-list">
              {KEYS.map(({ keys, what }) => (
                <div key={what} className="keys-row">
                  <dt>
                    {keys.map((key) => (
                      <kbd key={key} className="key">
                        {key}
                      </kbd>
                    ))}
                  </dt>
                  <dd>{what}</dd>
                </div>
              ))}
            </dl>
            <p className="text-xs font-bold text-ink-soft">
              Psst: the Lazy Shroom knows an old cheat code.
            </p>
            <form method="dialog" className="flex justify-end">
              <button className="btn btn-go">Got it</button>
            </form>
          </div>
        </div>
      </dialog>
    </>
  );
}
