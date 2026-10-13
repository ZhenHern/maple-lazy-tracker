import Link from "next/link";
import type { CSSProperties } from "react";
import { isAnimated } from "@/lib/images";
import { rewardKind } from "@/lib/reward-kind";
import { isTask } from "@/lib/tiering";
import type { Profile, Tier, TrackerItem } from "@/lib/types";
import { Countdown, ENDING_SOON, formatDate, formatRemaining } from "./countdown";
import { PixelSprite } from "./pixel-sprite";
import { PROFILE_INFO } from "./profile-picker";
import { ZoomImage } from "./zoom-image";

const CATEGORY_LABEL: Record<TrackerItem["category"], string> = {
  event: "Event",
  content: "New content",
  system: "System change",
};

const TIER_WORD: Record<Tier, string> = {
  must_do: "Must do",
  if_free: "If free",
  skip: "Skip",
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

/** How many reward names the closed card spells out before "+N more". */
const LOOT_NAMES = 2;

interface QuestItemProps {
  item: TrackerItem;
  profile: Profile;
  now: number | null;
  /** Position in the list, used to stagger the entrance animation. */
  index: number;
  /** True when the quest appeared since the visitor's previous visit. */
  isNew?: boolean;
  /** Set when the daily playtime moved this quest to another tier. */
  planNote?: "quick" | "over" | "soon" | "claim" | null;
}

const PLAN_NOTE = {
  quick: { chip: "Takes a minute", text: "Promoted to Must Do because it costs almost no time." },
  over: { chip: "Over your time", text: "Moved down because it does not fit your daily playtime." },
  soon: { chip: "Not open yet", text: "It has not started, so it is not part of today's plan." },
  claim: { chip: "Claim rewards", text: "The event is over. Only the rewards are left to collect." },
};

const TIME_COST_LABEL = {
  instant: "About a minute a day",
  short: "About 5 to 15 minutes a day",
  medium: "About 15 to 45 minutes a day",
  long: "More than 45 minutes a day",
  idle: "Runs while you are away",
};

// How much of the event's run has already passed, 0-100, or null when unknown.
function elapsedPercent(item: TrackerItem, now: number | null): number | null {
  if (now === null || !item.startsAt || !item.endsAt) return null;
  const start = Date.parse(item.startsAt);
  const end = Date.parse(item.endsAt);
  if (end <= start) return null;
  return Math.min(100, Math.max(0, ((now - start) / (end - start)) * 100));
}

// The "When" fact of an opened quest: the dates, then how long is left.
function whenText(item: TrackerItem, now: number | null): string {
  if (!item.endsAt) return "Permanent. No deadline.";
  const end = formatDate(item.endsAt);
  const dates = item.startsAt ? `${formatDate(item.startsAt)} to ${end}` : `Until ${end}`;
  if (now === null) return `${dates} (UTC)`;
  const remaining = Date.parse(item.endsAt) - now;
  return remaining <= 0
    ? `${dates} (UTC). Ended.`
    : `${dates} (UTC). ${formatRemaining(remaining)}.`;
}

export function QuestItem({
  item,
  profile,
  now,
  index,
  isNew = false,
  planNote = null,
}: QuestItemProps) {
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
  // The closed card names a couple of rewards, ones with a picture first, and
  // keeps each picture next to its own name.
  const loot = item.rewards
    .map((reward, position) => {
      const icon = item.rewardImages[position] ?? null;
      // No animated icons in the closed list, for the same reason as the thumbnail.
      return { reward, icon: icon && !isAnimated(icon) ? icon : null };
    })
    .sort((a, b) => Number(b.icon !== null) - Number(a.icon !== null))
    .slice(0, LOOT_NAMES);
  const elapsed = elapsedPercent(item, now);
  const urgent =
    now !== null && item.endsAt !== null && Date.parse(item.endsAt) - now < ENDING_SOON;
  const ratingNote = item.source.rating === "ai" ? null : RATING_NOTE[item.source.rating];
  // A system change or permanent content is news, not a task: it has no time,
  // no effort and no tier, whatever the stored data says.
  const task = isTask(item);
  const estimate = task ? item.timeEstimate : null;
  const moreLoot = item.rewards.length - LOOT_NAMES;

  return (
    <li className="quest-enter" style={{ "--order": Math.min(index, 10) } as CSSProperties}>
      <details className="quest">
        <summary className="quest-head">
          {thumbnail ? (
            // Hovering shows the picture larger. A click still opens the quest.
            <ZoomImage src={thumbnail} alt="" className="quest-icon" hoverOnly />
          ) : (
            <span className="quest-icon">
              <PixelSprite name="bulb" className="h-8" />
            </span>
          )}

          <div className="quest-main">
            <h3 className="quest-title">{item.title}</h3>
            <div className="quest-meta">
              {isNew && <span className="chip chip-new">New</span>}
              {planNote && (
                <span className="chip chip-quiet" title={PLAN_NOTE[planNote].text}>
                  {PLAN_NOTE[planNote].chip}
                </span>
              )}
              <Countdown
                startsAt={item.startsAt}
                endsAt={item.endsAt}
                claimUntil={item.claimUntil}
                now={now}
              />
              {ratingNote && (
                // A list that is mostly rough hides this chip and shows one
                // notice instead (see .ratings-rough in globals.css).
                <span
                  className="chip chip-provisional"
                  data-rating={item.source.rating}
                  title={ratingNote.text}
                >
                  {ratingNote.chip}
                </span>
              )}
            </div>
            <span className="quest-summary">{item.summary}</span>
            {item.rewards.length > 0 && (
              <span className="quest-loot">
                <PixelSprite name="chest" className="h-4 w-5 shrink-0" />
                <span className="sr-only">Rewards: </span>
                <span className="truncate">
                  {loot.map(({ reward, icon }, position) => (
                    <span key={reward + position}>
                      {position > 0 && ", "}
                      {icon && (
                        <ZoomImage src={icon} alt="" className="reward-icon" hoverOnly />
                      )}
                      {reward}
                    </span>
                  ))}
                  {moreLoot > 0 && `, +${moreLoot} more`}
                </span>
              </span>
            )}
          </div>

          <span className="quest-toggle" aria-hidden="true">
            <span className="quest-toggle-label" data-when="closed">
              Details
            </span>
            <span className="quest-toggle-label" data-when="open">
              Close
            </span>
            <span className="quest-chevron">▾</span>
          </span>

          {elapsed !== null && (
            <span
              className={`gauge quest-gauge ${urgent ? "gauge-urgent" : ""}`}
              aria-hidden="true"
            >
              <span className="gauge-fill" style={{ "--fill": `${elapsed}%` } as CSSProperties} />
            </span>
          )}
        </summary>

        <div className="quest-body">
          <p className="text-sm">{item.summary}</p>

          <dl className="quest-facts">
            <div className="fact">
              <dt>When</dt>
              <dd>
                {whenText(item, now)}
                {item.claimUntil && (
                  <span className="fact-note">
                    {" "}
                    Rewards can be claimed until {formatDate(item.claimUntil)}.
                  </span>
                )}
                {elapsed !== null && elapsed < 100 && (
                  <span className="fact-note"> {Math.round(elapsed)}% of the run has passed.</span>
                )}
              </dd>
            </div>
            {estimate && (
              <div className="fact">
                <dt>Time</dt>
                <dd>
                  {estimate.basis === "uncertain" ? (
                    <>
                      Unknown. <span className="fact-note">{estimate.label}</span>
                    </>
                  ) : (
                    <>
                      {estimate.label}
                      {estimate.basis === "calculated" && (
                        <span className="fact-note"> (estimated)</span>
                      )}
                    </>
                  )}
                </dd>
              </div>
            )}
            {task && (
              <div className="fact">
                <dt>Effort</dt>
                <dd>
                  {TIME_COST_LABEL[item.timeCost].replace(
                    " a day",
                    item.daysPerWeek >= 7
                      ? " a day"
                      : item.daysPerWeek === 1
                        ? ", once a week"
                        : `, ${item.daysPerWeek} days a week`,
                  )}
                  {planNote && <span className="fact-note"> {PLAN_NOTE[planNote].text}</span>}
                </dd>
              </div>
            )}
            <div className="fact">
              <dt>Type</dt>
              <dd>
                {CATEGORY_LABEL[item.category]}
                {estimate?.effort && `, ${EFFORT_LABEL[estimate.effort].toLowerCase()}`}
              </dd>
            </div>
          </dl>

          {item.steps.length > 0 && (
            <div>
              <h4 className="label">How to progress</h4>
              <ol className="quest-steps">
                {item.steps.map((step) => {
                  const later = now !== null && step.startsAt !== null && Date.parse(step.startsAt) > now;
                  return (
                    <li key={step.name} className="step">
                      <span className="step-name">
                        {step.name}
                        {later && (
                          <span className="chip chip-soon">Opens {formatDate(step.startsAt!)}</span>
                        )}
                      </span>
                      {step.what && <span className="step-what">{step.what}</span>}
                      {step.reward && (
                        <span className="step-reward">
                          <PixelSprite name="chest" className="h-4 w-5 shrink-0" />
                          {step.reward}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ol>
            </div>
          )}

          {item.rewards.length > 0 && (
            <div>
              <h4 className="label">Rewards</h4>
              <ul className="flex flex-wrap gap-2">
                {item.rewards.map((reward, position) => {
                  const icon = item.rewardImages[position];
                  // No picture in the patch notes: an icon for the kind of
                  // reward stands in, so the slot still says something.
                  const kind = rewardKind(reward);
                  return (
                    <li key={reward + position} className="slot">
                      {icon ? (
                        <ZoomImage src={icon} alt={reward} className="slot-icon" />
                      ) : (
                        <span className="slot-icon slot-kind" title={kind.label}>
                          <PixelSprite name={kind.sprite} className="h-5 w-5" />
                          <span className="sr-only">{kind.label}: </span>
                        </span>
                      )}
                      {reward}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {preview && (
            <div className="quest-media">
              <ZoomImage
                src={preview}
                alt={`${item.title} preview`}
                title={item.title}
                group={item.images}
                className="quest-preview"
              />
              {gallery.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {gallery.map((src, position) => (
                    <ZoomImage
                      key={src}
                      src={src}
                      alt={`${item.title} image ${position + 2}`}
                      title={item.title}
                      group={item.images}
                      className="quest-thumb"
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {task && (
            <div>
              <h4 className="label">Worth it for a {PROFILE_INFO[profile].name}?</h4>
              {/* The model's one-sentence reason. Older data has none. */}
              {item.why && <p className="quest-why">{item.why}</p>}
              <ul className="quest-ratings">
                {ratings.map(([axis, tier]) => (
                  <li key={axis} className={`rating tier-${tier}`}>
                    <span className="rating-axis">{axis}</span>
                    <span className="stars" aria-hidden="true">
                      {"★".repeat(TIER_STARS[tier])}
                      <span className="stars-off">{"★".repeat(3 - TIER_STARS[tier])}</span>
                    </span>
                    <span className="rating-word">{TIER_WORD[tier]}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {ratingNote && <p className="text-xs font-bold text-ink-soft">{ratingNote.text}</p>}

          <p className="text-xs text-ink-soft">
            From{" "}
            <a href={item.source.url} target="_blank" rel="noreferrer" className="underline">
              {item.source.title}
            </a>
            .{" "}
            <Link
              href={`/feedback?about=${encodeURIComponent(item.title)}`}
              className="underline"
              prefetch={false}
            >
              Something wrong? Report it
            </Link>
          </p>
        </div>
      </details>
    </li>
  );
}
