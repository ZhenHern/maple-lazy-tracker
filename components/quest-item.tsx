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

// Images load straight from Nexon's CDN in the visitor's browser. next/image is
// avoided on purpose: it would copy and re-serve them from our own server.
function NexonImage({ src, alt, className }: { src: string; alt: string; className: string }) {
  return (
    <a href={src} target="_blank" rel="noreferrer" className={className}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} loading="lazy" decoding="async" referrerPolicy="no-referrer" />
    </a>
  );
}

export function QuestItem({ item, profile, now }: QuestItemProps) {
  const ratings: [string, Tier][] = [
    ["Progression", item.value.progression[profile]],
    ["Limited", item.value.limited],
    ["Cosmetic", item.value.cosmetic],
  ];
  const [preview, ...gallery] = item.images;

  return (
    <li className={`quest ${preview ? "quest-with-preview" : ""}`}>
      {preview && (
        <NexonImage src={preview} alt={`${item.title} preview`} className="quest-preview" />
      )}

      <div className="grid min-w-0 gap-2">
        <div>
          <h3 className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="quest-title">{item.title}</span>
            <span className="chip chip-quiet">{CATEGORY_LABEL[item.category]}</span>
            <Countdown endsAt={item.endsAt} now={now} />
          </h3>
          <p className="mt-1 text-sm">{item.summary}</p>
        </div>

        {item.rewards.length > 0 && (
          <ul className="flex flex-wrap gap-1.5" aria-label="Rewards">
            {item.rewards.map((reward) => (
              <li key={reward} className="chip chip-reward">
                {reward}
              </li>
            ))}
          </ul>
        )}

        {gallery.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {gallery.map((src, index) => (
              <NexonImage
                key={src}
                src={src}
                alt={`${item.title} image ${index + 2}`}
                className="quest-thumb"
              />
            ))}
          </div>
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
