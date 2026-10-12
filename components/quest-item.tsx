import type { Profile, Tier, TrackerItem } from "@/lib/types";
import { Countdown } from "./countdown";

const CATEGORY_LABEL: Record<TrackerItem["category"], string> = {
  event: "Event",
  content: "New content",
  system: "System change",
};

const TIER_WORD: Record<Tier, string> = {
  must_do: "must do",
  if_free: "if free",
  skip: "skip",
};

interface QuestItemProps {
  item: TrackerItem;
  profile: Profile;
  done: boolean;
  onToggle: () => void;
  now: number | null;
}

function TimeEstimate({ estimate }: { estimate: TrackerItem["timeEstimate"] }) {
  if (!estimate) return null;
  if (estimate.basis === "uncertain") {
    return (
      <p className="text-sm text-ink-soft">
        <span className="font-bold text-ink">Time unknown.</span> {estimate.label}
      </p>
    );
  }
  return (
    <p className="text-sm text-ink-soft">
      <span className="font-bold text-ink">Time:</span> {estimate.label}
      {estimate.basis === "calculated" && " (estimated)"}
    </p>
  );
}

export function QuestItem({ item, profile, done, onToggle, now }: QuestItemProps) {
  const ratings: [string, Tier][] = [
    ["Progression", item.value.progression[profile]],
    ["Limited", item.value.limited],
    ["Cosmetic", item.value.cosmetic],
  ];

  return (
    <li className={`quest ${done ? "quest-done" : ""}`}>
      <label className="flex cursor-pointer items-start gap-3">
        <input type="checkbox" className="quest-check" checked={done} onChange={onToggle} />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="quest-title">{item.title}</span>
            <span className="chip chip-quiet">{CATEGORY_LABEL[item.category]}</span>
            <Countdown endsAt={item.endsAt} now={now} />
          </span>
          <span className="mt-1 block text-sm">{item.summary}</span>
        </span>
      </label>

      <div className="mt-2 grid gap-2 pl-9">
        {item.rewards.length > 0 && (
          <ul className="flex flex-wrap gap-1.5" aria-label="Rewards">
            {item.rewards.map((reward) => (
              <li key={reward} className="chip chip-reward">
                {reward}
              </li>
            ))}
          </ul>
        )}
        <TimeEstimate estimate={item.timeEstimate} />
        <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-soft">
          {ratings.map(([axis, tier]) => (
            <span key={axis}>
              <span className={`dot dot-${tier}`} aria-hidden="true" />
              {axis}: {TIER_WORD[tier]}
            </span>
          ))}
        </p>
      </div>
    </li>
  );
}
