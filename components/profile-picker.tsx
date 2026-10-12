import { PRIORITIES, PROFILES } from "@/lib/classifier/schema";
import type { Priority, Profile } from "@/lib/types";
import { PixelSprite, type SpriteName } from "./pixel-sprite";

export const PROFILE_INFO: Record<Profile, { name: string; hint: string; sprite: SpriteName }> = {
  new: { name: "Beginner", hint: "Still leveling a first main", sprite: "sprout" },
  casual: { name: "Casual", hint: "30-60 min a day", sprite: "cup" },
  endgame: { name: "Endgame", hint: "Bossing and progression", sprite: "sword" },
  returning: { name: "Returning", hint: "Back after a break", sprite: "door" },
};

const PRIORITY_INFO: Record<Priority, { name: string; hint: string; sprite: SpriteName }> = {
  progression: { name: "Progression", hint: "Getting stronger", sprite: "arrow" },
  limited: { name: "Limited items", hint: "May never return", sprite: "hourglass" },
  cosmetic: { name: "Cosmetics", hint: "Looks and collections", sprite: "hat" },
};

interface ProfilePickerProps {
  profile: Profile;
  priorities: Priority[];
  onProfileChange: (profile: Profile) => void;
  onPrioritiesChange: (priorities: Priority[]) => void;
}

export function ProfilePicker({
  profile,
  priorities,
  onProfileChange,
  onPrioritiesChange,
}: ProfilePickerProps) {
  function togglePriority(priority: Priority) {
    onPrioritiesChange(
      priorities.includes(priority)
        ? priorities.filter((active) => active !== priority)
        : PRIORITIES.filter((each) => each === priority || priorities.includes(each)),
    );
  }

  return (
    <div className="grid gap-5">
      <fieldset>
        <legend className="label">Choose your job</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {PROFILES.map((each) => (
            <button
              key={each}
              type="button"
              className="pick pick-job"
              aria-pressed={each === profile}
              onClick={() => onProfileChange(each)}
            >
              <PixelSprite name={PROFILE_INFO[each].sprite} className="pick-sprite h-10 w-10" />
              <span className="block font-extrabold">{PROFILE_INFO[each].name}</span>
              <span className="block text-xs text-ink-soft">{PROFILE_INFO[each].hint}</span>
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="label">What do you care about?</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {PRIORITIES.map((each) => (
            <button
              key={each}
              type="button"
              className="pick pick-skill"
              aria-pressed={priorities.includes(each)}
              onClick={() => togglePriority(each)}
            >
              <PixelSprite name={PRIORITY_INFO[each].sprite} className="pick-sprite h-7 w-7" />
              <span className="min-w-0 text-left">
                <span className="block font-extrabold">{PRIORITY_INFO[each].name}</span>
                <span className="block text-xs text-ink-soft">{PRIORITY_INFO[each].hint}</span>
              </span>
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs font-bold text-ink-soft">
          {priorities.length === 0
            ? "Nothing picked, so all three count."
            : "Pick any mix. A quest ranks by its best match."}
        </p>
      </fieldset>
    </div>
  );
}
