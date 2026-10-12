import type { CSSProperties } from "react";
import { isAnimated } from "@/lib/images";
import type { Profile, Tier, TrackerItem } from "@/lib/types";
import { Countdown, ENDING_SOON } from "./countdown";
import { PixelSprite } from "./pixel-sprite";

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

const TIER_STARS: Record<Tier, number> = { must_do: 3, if_free: 2, skip: 1 };

const EFFORT_LABEL = { low: "Low effort", medium: "Medium effort", high: "High effort" };

// Shown when an item's rating is not from a trusted model (see lib/classifier/models.ts).
const RATING_NOTE = {
  backup: {
    chip: "Rough rating",
    text: "Rated by a backup AI model because today's quota ran out. It will be re-rated automatically.",
  },
  unrated: {
    chip: "Not rated yet",
    text: "Listed without an AI rating because today's quota ran out. It will be rated automatically.",
  },
};

interface QuestItemProps {
  item: TrackerItem;
  profile: Profile;
  now: number | null;
  /** Position in the list, used to stagger the entrance animation. */
  index: number;
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

// How much of the event's run has already passed, 0-100, or null when unknown.
function elapsedPercent(item: TrackerItem, now: number | null): number | null {
  if (now === null || !item.startsAt || !item.endsAt) return null;
  const start = Date.parse(item.startsAt);
  const end = Date.parse(item.endsAt);
  if (end <= start) return null;
  return Math.min(100, Math.max(0, ((now - start) / (end - start)) * 100));
}

export function QuestItem({ item, profile, now, index }: QuestItemProps) {
  const ratings: [string, Tier][] = [
    ["Progression", item.value.progression[profile]],
    ["Limited", item.value.limited],
    ["Cosmetic", item.value.cosmetic],
  ];
  const [preview, ...gallery] = item.images;
  // The small thumbnail in the list is never an animated GIF: dozens of them
  // playing at once is what made scrolling stutter. GIFs only load once the
  // quest is opened (a closed <details> does not render its contents).
  const thumbnail = item.images.find((image) => !isAnimated(image));
  const icons = item.rewardImages.filter((icon) => icon !== null);
  const elapsed = elapsedPercent(item, now);
  const urgent =
    now !== null && item.endsAt !== null && Date.parse(item.endsAt) - now < ENDING_SOON;
  const ratingNote = item.source.rating === "ai" ? null : RATING_NOTE[item.source.rating];

  return (
    <li className="quest-enter" style={{ "--order": Math.min(index, 10) } as CSSProperties}>
      <details className="quest group">
        <summary className="quest-head">
          <span className="quest-icon">
            {thumbnail ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={thumbnail} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" />
            ) : (
              <PixelSprite name="bulb" className="h-8" />
            )}
          </span>

          <div className="grid min-w-0 gap-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <h3 className="quest-title">{item.title}</h3>
              <Countdown endsAt={item.endsAt} now={now} />
              {ratingNote && (
                <span className="chip chip-provisional" title={ratingNote.text}>
                  {ratingNote.chip}
                </span>
              )}
            </div>
            <span className="line-clamp-2 text-sm text-ink-soft group-open:hidden">
              {item.summary}
            </span>
            {icons.length > 0 && (
              <span className="flex gap-1 group-open:hidden" aria-hidden="true">
                {icons.slice(0, 6).map((icon, position) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={icon + position}
                    src={icon}
                    alt=""
                    className="reward-icon"
                    loading="lazy"
                    referrerPolicy="no-referrer"
                  />
                ))}
              </span>
            )}
          </div>

          <span className="quest-chevron" aria-hidden="true">
            ▾
          </span>

          {elapsed !== null && (
            <span
              className={`gauge quest-gauge ${urgent ? "gauge-urgent" : ""}`}
              aria-hidden="true"
            >
              <span className="gauge-fill" style={{ width: `${elapsed}%` }} />
            </span>
          )}
        </summary>

        <div className="quest-body">
          {preview && (
            <NexonImage src={preview} alt={`${item.title} preview`} className="quest-preview" />
          )}

          <p className="text-sm">{item.summary}</p>

          <p className="flex flex-wrap gap-1.5">
            <span className="chip chip-quiet">{CATEGORY_LABEL[item.category]}</span>
            {item.timeEstimate?.effort && (
              <span className="chip chip-quiet">{EFFORT_LABEL[item.timeEstimate.effort]}</span>
            )}
            {elapsed !== null && (
              <span className="chip chip-quiet">{Math.round(elapsed)}% of the event has passed</span>
            )}
          </p>

          {item.rewards.length > 0 && (
            <div>
              <h4 className="label">Rewards</h4>
              <ul className="flex flex-wrap gap-2">
                {item.rewards.map((reward, position) => {
                  const icon = item.rewardImages[position];
                  return (
                    <li key={reward + position} className="slot">
                      <span className="slot-icon" aria-hidden="true">
                        {icon ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={icon} alt="" loading="lazy" referrerPolicy="no-referrer" />
                        ) : (
                          "★"
                        )}
                      </span>
                      {reward}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {gallery.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {gallery.map((src, position) => (
                <NexonImage
                  key={src}
                  src={src}
                  alt={`${item.title} image ${position + 2}`}
                  className="quest-thumb"
                />
              ))}
            </div>
          )}

          <TimeEstimate estimate={item.timeEstimate} />

          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs font-bold text-ink-soft">
            {ratings.map(([axis, tier]) => (
              <li key={axis}>
                {axis}{" "}
                <span className="stars" aria-hidden="true">
                  {"★".repeat(TIER_STARS[tier])}
                  <span className="stars-off">{"★".repeat(3 - TIER_STARS[tier])}</span>
                </span>
                <span className="sr-only">: {TIER_WORD[tier]}</span>
              </li>
            ))}
          </ul>

          {ratingNote && <p className="text-xs font-bold text-ink-soft">{ratingNote.text}</p>}

          <p className="text-xs text-ink-soft">
            From{" "}
            <a href={item.source.url} target="_blank" rel="noreferrer" className="underline">
              {item.source.title}
            </a>
          </p>
        </div>
      </details>
    </li>
  );
}
