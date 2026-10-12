import { normalizeTitle } from "@/lib/images";
import type { ScoredItem } from "@/lib/types";
import { findDates, isGroundedDate } from "./dates";
import { eventPeriod } from "./rules";

// Checks a model's answer against the post it was given, in plain code.
//
// A model can return well-formed JSON that is still wrong: a date the post
// never mentions, a reward it made up, a coin shop listed as an event. Weaker
// models do this more often, and they are exactly the ones that answer when the
// quota runs out. These checks cost no AI calls and apply to every model.

interface GroundingInput {
  text: string;
  publishedAt: string;
  kind?: "patch" | "event";
}

export interface Grounded {
  items: ScoredItem[];
  /** What was corrected, for the ingest report and the stored post. */
  warnings: string[];
}

// Words in a reward that say nothing about which item it is.
const FILLER = new Set(["x", "the", "of", "a", "an", "and", "or", "to", "up", "for", "with", "per"]);

function words(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[’']/g, "")
    .split(/[^a-z0-9]+/)
    .filter((word) => word && !/^\d+$/.test(word) && !FILLER.has(word))
    // "Coupons" and "coupon" should match.
    .map((word) => (word.length > 3 && word.endsWith("s") ? word.slice(0, -1) : word));
}

// A reward counts as real when most of its words appear in the post. Models
// shorten and reword names, so an exact match would reject honest answers.
const REWARD_MATCH = 0.6;

function isGroundedReward(reward: string, textWords: Set<string>): boolean {
  const wanted = words(reward);
  if (wanted.length === 0) return false;
  const found = wanted.filter((word) => textWords.has(word)).length;
  return found / wanted.length >= REWARD_MATCH;
}

const DAY = 86_400_000;
const TIME_UNIT = /\b(sec|second|min|minute|hr|hour)s?\b/i;

// The prompt forbids these as items of their own: a shop is where an event's
// coins are spent, not something to do.
const SHOP_TITLE = /\bshop$/i;

export function groundItems(items: ScoredItem[], post: GroundingInput): Grounded {
  const warnings: string[] = [];
  const dates = findDates(post.text, post.publishedAt);
  const textWords = new Set(words(post.text));

  const kept: ScoredItem[] = [];
  for (const item of items) {
    // Exact repeats only: "Operation: Dive" and "Operation: Dive Dungeon" are
    // different activities, so a shared prefix is not enough here.
    if (kept.some((existing) => normalizeTitle(existing.title) === normalizeTitle(item.title))) {
      warnings.push(`"${item.title}": duplicate item removed`);
      continue;
    }
    if (item.category === "event" && items.length > 1 && SHOP_TITLE.test(item.title.trim())) {
      warnings.push(`"${item.title}": a shop is not an item of its own, removed`);
      continue;
    }

    let { startsAt, endsAt, timeEstimate } = item;
    if (startsAt && !isGroundedDate(startsAt, dates, post.publishedAt)) {
      warnings.push(`"${item.title}": start date ${startsAt} is not in the post, cleared`);
      startsAt = null;
    }
    if (endsAt && !isGroundedDate(endsAt, dates, post.publishedAt)) {
      warnings.push(`"${item.title}": end date ${endsAt} is not in the post, cleared`);
      endsAt = null;
    }
    if (startsAt && endsAt && Date.parse(endsAt) <= Date.parse(startsAt)) {
      warnings.push(`"${item.title}": ends before it starts, start date cleared`);
      startsAt = null;
    }

    const rewards = item.rewards.filter((reward) => {
      const grounded = isGroundedReward(reward, textWords);
      if (!grounded) warnings.push(`"${item.title}": reward "${reward}" is not in the post, removed`);
      return grounded;
    });

    // "1,000 monsters/day" is a quantity, not a duration. Without a unit of
    // time the estimate is not one a player can plan with.
    if (timeEstimate && timeEstimate.basis !== "uncertain" && !TIME_UNIT.test(timeEstimate.label)) {
      warnings.push(`"${item.title}": time estimate "${timeEstimate.label}" has no duration, marked uncertain`);
      timeEstimate = { ...timeEstimate, basis: "uncertain", minutesPerWeek: null, effort: null };
    }

    // Taking part in an event always costs some time. A model that leaves the
    // estimate out has skipped the question, not answered "none".
    if (!timeEstimate && item.category === "event") {
      warnings.push(`"${item.title}": no time estimate given, marked uncertain`);
      timeEstimate = {
        label: "Not stated in the post",
        minutesPerWeek: null,
        effort: null,
        basis: "uncertain",
      };
    }

    kept.push({ ...item, startsAt, endsAt, rewards, timeEstimate });
  }
  // A notice about a single event states its period outright, and code reads
  // that more reliably than a model does (models sometimes copy the Pacific
  // time as if it were UTC). When the two ends are within a day of each other
  // they mean the same moment, so the stated one wins.
  if (post.kind === "event" && kept.length === 1) {
    const [only] = kept;
    const stated = eventPeriod(post).endsAt;
    if (stated && only.endsAt) {
      const gap = Math.abs(Date.parse(stated) - Date.parse(only.endsAt));
      if (gap > 0 && gap <= DAY) {
        warnings.push(`"${only.title}": end time ${only.endsAt} aligned to the stated ${stated}`);
        kept[0] = { ...only, endsAt: stated };
      }
    }
  }
  return { items: kept, warnings };
}
