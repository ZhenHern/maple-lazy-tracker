import { PRIORITIES, TIERS } from "@/lib/classifier/schema";
import type { Priority, Profile, Tier, TimeCost, TrackerItem } from "@/lib/types";

// Turns the model's ratings into the list one particular player sees.
//
// The model answers two questions per quest: how valuable are the rewards to
// each kind of player, and roughly how long does it take. It never sees the
// player's free time. Fitting quests into that time is done here, in code, so
// changing the playtime re-sorts the page at once and costs no AI call.

/** Daily playtime choices in minutes. 0 means no limit. */
export const PLAYTIMES = [15, 30, 60, 0] as const;
export type Playtime = (typeof PLAYTIMES)[number];
export const DEFAULT_PLAYTIME: Playtime = 30;

/** Minutes each time class is counted as on a day the quest is played. */
export const TIME_COST_MINUTES: Record<TimeCost, number> = {
  instant: 1,
  short: 10,
  medium: 30,
  long: 75,
};

// At or under this many minutes a day, a quest is as good as free.
const QUICK_MINUTES = 2;

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
   * Why the plan differs from the reward-value tier, or null when it does not.
   * quick: promoted, it takes a minute or two. over: it does not fit the day.
   * soon: it has not opened yet, so it is not part of today at all.
   */
  note: "quick" | "over" | "soon" | null;
}

/** True when a quest has a start date that is still ahead of `now`. */
export function notOpenYet(item: TrackerItem, now: number | null): boolean {
  return now !== null && item.startsAt !== null && Date.parse(item.startsAt) > now;
}

/**
 * Minutes a day a quest costs, averaged over the week. A 30-minute activity
 * that can only be done three days a week costs about 13 minutes a day, and a
 * few minutes once a week is next to nothing.
 */
export function dailyMinutes(item: TrackerItem): number {
  return (TIME_COST_MINUTES[item.timeCost] * item.daysPerWeek) / 7;
}

function demote(tier: Tier): Tier {
  return tier === "must_do" ? "if_free" : "skip";
}

/**
 * The tier of every quest for one player, given their job, priorities and
 * daily playtime. The rules, in order:
 *
 * 1. A quest that has not opened is set aside ("soon"). It cannot be done
 *    today, so it neither takes time nor counts as a Must Do yet.
 * 2. A quest that costs a minute or two a day is a Must Do for everyone,
 *    unless its rewards are worthless to this player (it was a Skip). A daily
 *    check-in costs nothing, so there is no reason to pass on it.
 * 3. A quest that alone takes longer than the whole playtime drops one tier.
 * 4. The remaining Must Do quests are taken best first until the playtime is
 *    full: the highest score that still fits goes in next, and the ones that
 *    do not fit become If Free. Best first, not cheapest first: the top
 *    reward of a patch must not lose its place to several small ones.
 * 5. When the player picked no priority, quests that are Must Do for
 *    progression fill the day before quests that are Must Do only for looks
 *    or collecting. Someone who has not said they care about cosmetics should
 *    not see an outfit event ahead of the patch's best progression reward.
 */
export function planDay(
  items: TrackerItem[],
  profile: Profile,
  priorities: readonly Priority[],
  playtime: Playtime,
  now: number | null,
): Map<string, Plan> {
  const plans = new Map<string, Plan>();
  const competing: { item: TrackerItem; minutes: number; score: number; core: boolean }[] = [];
  let used = 0;

  for (const item of items) {
    const base = resolveTier(item, profile, priorities);
    const minutes = dailyMinutes(item);

    if (notOpenYet(item, now)) {
      plans.set(item.id, { tier: base, note: "soon" });
    } else if (minutes <= QUICK_MINUTES && base !== "skip") {
      plans.set(item.id, { tier: "must_do", note: base === "must_do" ? null : "quick" });
      used += minutes;
    } else if (playtime !== 0 && minutes > playtime && base !== "skip") {
      plans.set(item.id, { tier: demote(base), note: "over" });
    } else if (base === "must_do") {
      competing.push({
        item,
        minutes,
        score: bestScore(item, profile, priorities),
        // "Core" = what the player asked for. With nothing picked, that is progression.
        core: priorities.length > 0 || item.value.progression[profile] === "must_do",
      });
    } else {
      plans.set(item.id, { tier: base, note: null });
    }
  }

  competing.sort((a, b) => Number(b.core) - Number(a.core) || b.score - a.score);
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

/** Minutes a day the Must Do quests of a plan add up to, rounded. */
export function plannedMinutes(items: TrackerItem[], plans: Map<string, Plan>): number {
  const total = items
    .filter((item) => {
      const plan = plans.get(item.id);
      return plan?.tier === "must_do" && plan.note !== "soon";
    })
    .reduce((sum, item) => sum + dailyMinutes(item), 0);
  return Math.round(total);
}
