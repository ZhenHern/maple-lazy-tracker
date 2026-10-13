import { PRIORITIES, TIERS } from "@/lib/classifier/schema";
import type { Priority, Profile, Tier, TimeCost, TrackerItem } from "@/lib/types";

// Turns the model's ratings into the list one particular player sees.
//
// The model answers two questions per quest: how valuable are the rewards to
// each kind of player, and roughly how long does it take a day. It never sees
// the player's free time. Fitting quests into that time is done here, in code,
// so changing the playtime re-sorts the page at once and costs no AI call.

/** Daily playtime choices in minutes. 0 means no limit. */
export const PLAYTIMES = [15, 30, 60, 0] as const;
export type Playtime = (typeof PLAYTIMES)[number];
export const DEFAULT_PLAYTIME: Playtime = 30;

/** Minutes a day each time class is counted as when filling a player's time. */
export const TIME_COST_MINUTES: Record<TimeCost, number> = {
  instant: 1,
  short: 10,
  medium: 30,
  long: 75,
};

/**
 * The tier from reward value alone: the best rating among the priorities the
 * player cares about. With no priorities chosen, all three count.
 */
export function resolveTier(
  item: TrackerItem,
  profile: Profile,
  priorities: readonly Priority[],
): Tier {
  const active = priorities.length > 0 ? priorities : PRIORITIES;
  const ratings = active.map((priority) =>
    priority === "progression" ? item.value.progression[profile] : item.value[priority],
  );
  // TIERS is ordered best first, so the lowest index is the best rating.
  return TIERS[Math.min(...ratings.map((rating) => TIERS.indexOf(rating)))];
}

/** The raw 0-100 score behind that tier: the highest among the chosen priorities. */
export function bestScore(
  item: TrackerItem,
  profile: Profile,
  priorities: readonly Priority[],
): number {
  const active = priorities.length > 0 ? priorities : PRIORITIES;
  return Math.max(
    ...active.map((priority) =>
      priority === "progression" ? item.scores.progression[profile] : item.scores[priority],
    ),
  );
}

export interface Plan {
  tier: Tier;
  /**
   * Why playtime changed the tier, or null when it did not.
   * quick: promoted, it takes a minute. over: it does not fit the day.
   */
  note: "quick" | "over" | null;
}

/** Minutes a day a quest costs, or 0 when it needs no play time right now. */
export function dailyMinutes(item: TrackerItem, now: number | null): number {
  // A passive system change, or a quest that has not opened, uses no time today.
  if (item.timeEstimate === null && item.category === "system") return 0;
  if (now !== null && item.startsAt !== null && Date.parse(item.startsAt) > now) return 0;
  return TIME_COST_MINUTES[item.timeCost];
}

function demote(tier: Tier): Tier {
  return tier === "must_do" ? "if_free" : "skip";
}

/**
 * The tier of every quest for one player, given their job, priorities and
 * daily playtime. Three rules, in order:
 *
 * 1. A quest that takes about a minute is a Must Do for everyone, unless its
 *    rewards are worthless to this player (it was a Skip). A daily check-in
 *    costs nothing, so there is no reason to pass on it.
 * 2. A quest that alone takes longer than the whole playtime drops one tier.
 * 3. The remaining Must Do quests are taken best-value-per-minute first until
 *    the playtime is full. The ones that do not fit become If Free.
 */
export function planDay(
  items: TrackerItem[],
  profile: Profile,
  priorities: readonly Priority[],
  playtime: Playtime,
  now: number | null,
): Map<string, Plan> {
  const plans = new Map<string, Plan>();
  const competing: { item: TrackerItem; minutes: number; score: number }[] = [];
  let used = 0;

  for (const item of items) {
    const base = resolveTier(item, profile, priorities);
    const minutes = dailyMinutes(item, now);
    const instant = minutes > 0 && minutes <= TIME_COST_MINUTES.instant;

    if (instant && base !== "skip") {
      plans.set(item.id, { tier: "must_do", note: base === "must_do" ? null : "quick" });
      used += minutes;
    } else if (playtime !== 0 && minutes > playtime && base !== "skip") {
      plans.set(item.id, { tier: demote(base), note: "over" });
    } else if (base === "must_do" && minutes > 0) {
      competing.push({ item, minutes, score: bestScore(item, profile, priorities) });
    } else {
      plans.set(item.id, { tier: base, note: null });
    }
  }

  // Best value per minute first; the higher score wins a tie.
  competing.sort((a, b) => b.score / b.minutes - a.score / a.minutes || b.score - a.score);
  for (const { item, minutes } of competing) {
    if (playtime === 0 || used + minutes <= playtime) {
      plans.set(item.id, { tier: "must_do", note: null });
      used += minutes;
    } else {
      plans.set(item.id, { tier: "if_free", note: "over" });
    }
  }
  return plans;
}

/** Minutes a day the Must Do quests of a plan add up to. */
export function plannedMinutes(
  items: TrackerItem[],
  plans: Map<string, Plan>,
  now: number | null,
): number {
  return items
    .filter((item) => plans.get(item.id)?.tier === "must_do")
    .reduce((total, item) => total + dailyMinutes(item, now), 0);
}
