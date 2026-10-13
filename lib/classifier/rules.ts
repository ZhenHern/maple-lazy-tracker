import type { ScoredItem, ScrapedPost } from "@/lib/types";
import { findDates } from "./dates";

// The last resort when every model has refused: list a new event without an
// AI rating, so players still learn it exists and when it ends.
//
// Only for event notices, which are about one event. Patch notes hold dozens of
// items and cannot be split sensibly without a model, so they wait for quota.

// Mid-scale on every axis: the item lands in "if free" for every player, never
// in "must do" (which needs 70) and never hidden in "skip".
const NEUTRAL_SCORE = 50;
const HOUR = 3_600_000;

const SUMMARY =
  "New event notice. It has not been rated yet because today's AI quota is used up; see the official post for details.";

function cleanTitle(title: string): string {
  return (
    title
      // "[Update Aug 26] Fantasia Finale Event" -> "Fantasia Finale Event"
      .replace(/^\s*\[[^\]]*\]\s*/, "")
      .replace(/[!\s]+$/, "")
      .trim() || title
  );
}

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "item"
  );
}

/**
 * The event's running period, read from lines like
 * "October 7, 2026 12:00 AM UTC - November 10, 2026 11:59 PM UTC".
 * Takes the widest span the post states; null when it states none.
 */
export function eventPeriod(post: Pick<ScrapedPost, "text" | "publishedAt">): {
  startsAt: string | null;
  endsAt: string | null;
} {
  let start: number | null = null;
  let end: number | null = null;

  for (const line of post.text.split("\n")) {
    // A period is a line with two dates joined by a dash.
    if (!/\s[-–—]\s/.test(line)) continue;
    const dates = findDates(line, post.publishedAt);
    if (dates.length < 2) continue;
    // Some posts give the period per time zone: "PDT (UTC -7): Aug 25 5:00 PM - ...".
    // The offset turns that local time back into UTC.
    const zone = /\(UTC\s*([+\-−])\s*(\d{1,2})\)/.exec(line);
    const offset = zone ? (zone[1] === "+" ? 1 : -1) * Number(zone[2]) * HOUR : 0;
    const from = dates[0].time - offset;
    const to = dates[dates.length - 1].time - offset;
    if (to <= from) continue;
    if (start === null || from < start) start = from;
    if (end === null || to > end) end = to;
  }
  return {
    startsAt: start === null ? null : new Date(start).toISOString(),
    endsAt: end === null ? null : new Date(end).toISOString(),
  };
}

/** One unrated item for an event notice, built without any AI call. */
export function rulesClassify(post: ScrapedPost): ScoredItem[] {
  const title = cleanTitle(post.title);
  return [
    {
      id: slugify(title),
      title,
      category: "event",
      summary: SUMMARY,
      why: "",
      timeCost: "short",
      daysPerWeek: 7,
      value: {
        progression: {
          casual: NEUTRAL_SCORE,
          endgame: NEUTRAL_SCORE,
          returning: NEUTRAL_SCORE,
        },
        limited: NEUTRAL_SCORE,
        cosmetic: NEUTRAL_SCORE,
      },
      rewards: [],
      ...eventPeriod(post),
      timeEstimate: {
        label: "Not rated yet",
        minutesPerWeek: null,
        effort: null,
        basis: "uncertain",
      },
    },
  ];
}
