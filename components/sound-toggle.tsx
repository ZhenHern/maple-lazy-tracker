"use client";

import { playSfx, sanitizeSound, SOUND_KEY } from "@/lib/sfx";
import { useLocalStorage } from "@/lib/use-local-storage";

// The Sounds switch. Off until the visitor turns it on; the choice is kept in
// localStorage like the day / night mode. ArcadeFx reads the same key.
export function SoundToggle() {
  const [on, setOn] = useLocalStorage(SOUND_KEY, sanitizeSound);

  return (
    <button
      type="button"
      className="filter"
      aria-pressed={on}
      title="Little 8-bit sounds on clicks. Off by default."
      onClick={() => {
        setOn(!on);
        // A taste of what was just switched on.
        if (!on) playSfx("pick");
      }}
    >
      <span aria-hidden="true">♪ </span>Sounds
    </button>
  );
}
