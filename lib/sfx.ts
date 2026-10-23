// Tiny 8-bit sounds made on the spot with the Web Audio API: a few square-wave
// notes per sound, so no audio files are downloaded and none are copied from
// the game. They only play when the visitor has switched Sounds on, and only
// after a click or key press, which is when browsers allow audio to start.

/** The localStorage key of the Sounds switch (a boolean, off by default). */
export const SOUND_KEY = "lazy-tracker:sound";

export type SfxKind = "tick" | "tab" | "pick" | "open" | "go";

/** Stored data is untrusted input too: anything but `true` means off. */
export function sanitizeSound(stored: unknown): boolean {
  return stored === true;
}

// Note frequencies in Hz and the gap between notes in seconds.
const TUNES: Record<SfxKind, { notes: number[]; step: number }> = {
  tick: { notes: [880], step: 0.04 },
  tab: { notes: [523.25, 659.25], step: 0.05 },
  pick: { notes: [523.25, 659.25, 783.99, 1046.5], step: 0.06 },
  open: { notes: [440, 587.33], step: 0.05 },
  go: { notes: [659.25, 987.77], step: 0.07 },
};

const VOLUME = 0.05;

let context: AudioContext | null = null;

function audio(): AudioContext | null {
  if (context) return context;
  if (typeof window === "undefined") return null;
  // Older Safari only has the prefixed name.
  const Context =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Context) return null;
  try {
    context = new Context();
  } catch {
    return null;
  }
  return context;
}

/** Plays one sound. The caller decides whether the visitor wants sound. */
export function playSfx(kind: SfxKind): void {
  const ctx = audio();
  if (!ctx) return;
  // A context made before the first click starts "suspended".
  if (ctx.state === "suspended") ctx.resume().catch(() => {});

  const { notes, step } = TUNES[kind];
  const start = ctx.currentTime + 0.01;
  notes.forEach((frequency, position) => {
    const at = start + position * step;
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = "square";
    oscillator.frequency.value = frequency;
    // A short fade in and out keeps each note from clicking.
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(VOLUME, at + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + step + 0.05);
    oscillator.connect(gain).connect(ctx.destination);
    oscillator.start(at);
    oscillator.stop(at + step + 0.06);
  });
}
