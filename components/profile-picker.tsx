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

// Kept short on purpose: on a phone all four jobs sit in one row and the three
// priorities in another, so the quest list stays close to the top of the page.
// Hints that do not fit are still read out by screen readers (max-sm:sr-only).
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
    <div className="grid gap-4">
      <fieldset className="min-w-0">
        <legend className="label">Choose your job</legend>
        <div className="grid grid-cols-4 gap-1.5 sm:gap-2">
          {PROFILES.map((each) => (
            <button
              key={each}
              type="button"
              className="pick pick-job"
              aria-pressed={each === profile}
              onClick={() => onProfileChange(each)}
            >
              <PixelSprite
                name={PROFILE_INFO[each].sprite}
                className="pick-sprite h-8 w-8 sm:h-10 sm:w-10"
              />
              <span className="pick-name">{PROFILE_INFO[each].name}</span>
              <span className="pick-hint max-sm:sr-only">{PROFILE_INFO[each].hint}</span>
            </button>
          ))}
        </div>
        {/* On a phone only the chosen job's hint is shown, under the row. */}
        <p className="pick-caption sm:hidden" aria-hidden="true">
          <strong>{PROFILE_INFO[profile].name}:</strong> {PROFILE_INFO[profile].hint}
        </p>
      </fieldset>

      <fieldset className="min-w-0">
        <legend className="label">
          What do you care about? <span className="label-note">Optional</span>
        </legend>
        <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
          {PRIORITIES.map((each) => (
            <button
              key={each}
              type="button"
              className="pick pick-skill"
              aria-pressed={priorities.includes(each)}
              onClick={() => togglePriority(each)}
            >
              <PixelSprite name={PRIORITY_INFO[each].sprite} className="pick-sprite h-6 w-6 sm:h-7 sm:w-7" />
              <span className="min-w-0">
                <span className="pick-name">{PRIORITY_INFO[each].name}</span>
                <span className="pick-hint max-sm:sr-only">{PRIORITY_INFO[each].hint}</span>
              </span>
            </button>
          ))}
        </div>
        <p className="pick-caption">
          {priorities.length === 0
            ? "Nothing picked, so all three count."
            : "Pick any mix. A quest ranks by its best match."}
        </p>
      </fieldset>
    </div>
  );
}
