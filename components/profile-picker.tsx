import { PRIORITIES, PROFILES } from "@/lib/classifier/schema";
import type { Priority, Profile } from "@/lib/types";

const PROFILE_INFO: Record<Profile, { name: string; hint: string }> = {
  new: { name: "New", hint: "Still leveling a first main" },
  casual: { name: "Casual", hint: "30-60 min a day" },
  endgame: { name: "Endgame", hint: "Bossing and progression" },
  returning: { name: "Returning", hint: "Back after a break" },
};

const PRIORITY_INFO: Record<Priority, { name: string; hint: string }> = {
  progression: { name: "Progression", hint: "Getting stronger" },
  limited: { name: "Limited items", hint: "Rewards that may never return" },
  cosmetic: { name: "Cosmetics", hint: "Looks and collections" },
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
    <div className="grid gap-4 sm:grid-cols-2">
      <fieldset>
        <legend className="label">I am a...</legend>
        <div className="grid grid-cols-2 gap-2">
          {PROFILES.map((each) => (
            <button
              key={each}
              type="button"
              className="btn"
              aria-pressed={each === profile}
              onClick={() => onProfileChange(each)}
            >
              <span className="block font-bold">{PROFILE_INFO[each].name}</span>
              <span className="block text-xs opacity-80">{PROFILE_INFO[each].hint}</span>
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="label">I care about...</legend>
        <div className="grid gap-2">
          {PRIORITIES.map((each) => (
            <button
              key={each}
              type="button"
              className="btn text-left"
              aria-pressed={priorities.includes(each)}
              onClick={() => togglePriority(each)}
            >
              <span className="font-bold">{PRIORITY_INFO[each].name}</span>
              <span className="ml-2 text-xs opacity-80">{PRIORITY_INFO[each].hint}</span>
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-ink-soft">
          {priorities.length === 0
            ? "Nothing picked, so all three count."
            : "Pick any mix. An item ranks by its best match."}
        </p>
      </fieldset>
    </div>
  );
}
