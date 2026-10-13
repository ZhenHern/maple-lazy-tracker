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
  // Runs while the player is away, so it uses none of their playtime.
  idle: 0,
};

// At or under this many minutes a day, a quest is as good as free.
const QUICK_MINUTES = 2;

/**
 * The tier from reward value alone: the best rating among the priorities the
 * player cares about.
 *
 * With no priority chosen, a Must Do needs progression value. A quest that is
 * only worth it for its looks or for collecting tops out at If Free there: a
 * player who never said they care about outfits should not be told they
 * "must" get one. Picking Cosmetics or Limited makes those count in full.
 */
export function resolveTier(
  item: TrackerItem,
  profile: Profile,
  priorities: readonly Priority[],
): Tier {
  const rating = (priority: Priority) =>
    priority === "progression" ? item.value.progression[profile] : item.value[priority];
  // TIERS is ordered best first, so the lowest index is the best rating.
  const best = (list: readonly Priority[]) =>
    TIERS[Math.min(...list.map((priority) => TIERS.indexOf(rating(priority))))];

  if (priorities.length > 0) return best(priorities);
  const progression = rating("progression");
  if (progression === "must_do") return "must_do";
  return best(PRIORITIES) === "skip" ? "skip" : "if_free";
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
   * claim: it has ended; only its rewards are left to collect.
   */
  note: "quick" | "over" | "soon" | "claim" | null;
}

/**
 * True for something to do before a deadline. A system change or a piece of
 * permanent content is not a task: there is nothing to "skip" or to do "if
 * free", and no time to spend, so it gets no tier, no time and no effort.
 * It is shown as news instead.
 */
export function isTask(item: { endsAt: string | null; category: TrackerItem["category"] }): boolean {
  return item.endsAt !== null && item.category !== "system";
}

const SCHEDULE_DAY_MS = 36 * 3_600_000;

/**
 * True for a rotating schedule of perk days (Sunny Sunday): every step is one
 * short dated day. It is not a quest: there is nothing to do and nothing to
 * rank against other quests, so it gets a panel of its own, with no tier.
 */
export function isSchedule(item: {
  steps: { startsAt: string | null; endsAt: string | null }[];
}): boolean {
  return (
    item.steps.length >= 2 &&
    item.steps.every(
      (step) =>
        step.startsAt !== null &&
        step.endsAt !== null &&
        Date.parse(step.endsAt) - Date.parse(step.startsAt) <= SCHEDULE_DAY_MS,
    )
  );
}

/** The last moment a quest still matters: its claim deadline if it has one, else its end. */
export function closesAt(item: Pick<TrackerItem, "endsAt" | "claimUntil">): string | null {
  return item.claimUntil ?? item.endsAt;
}

/** True when a quest can no longer be played but its rewards can still be claimed. */
export function claimOnly(item: TrackerItem, now: number | null): boolean {
  return (
    now !== null &&
    item.endsAt !== null &&
    item.claimUntil !== null &&
    Date.parse(item.endsAt) <= now &&
    Date.parse(item.claimUntil) > now
  );
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
 *    An idle (AFK) quest takes no playtime either, and keeps the tier its
 *    rewards earn: it is not a one-click claim, so it is not promoted.
 *    A quest that has ended but whose rewards can still be claimed is a
 *    one-click Must Do until its claim deadline.
 * 2. A quest that costs a minute or two a day is a Must Do for everyone,
 *    unless its rewards are worthless to this player (it was a Skip). A daily
 *    check-in costs nothing, so there is no reason to pass on it.
 * 3. A quest that alone takes longer than the whole playtime drops one tier.
 * 4. The remaining Must Do quests are taken best first until the playtime is
 *    full: the highest score that still fits goes in next, and the ones that
 *    do not fit become If Free. Best first, not cheapest first: the top
 *    reward of a patch must not lose its place to several small ones.
 *    These quick quests do not use up the playtime the bigger quests compete
 *    for: three check-ins must not push the patch's best reward out of a
 *    15-minute day.
 * 5. When the player picked no priority, quests that are Must Do for
 *    progression fill the day before quests that are Must Do only for looks
 *    or collecting. Someone who has not said they care about cosmetics should
 *    not see an outfit event ahead of the patch's best progression reward.
 * 6. A quest that unlocks another one (it grants the rank the other needs) is
 *    never rated below the quest it unlocks: skipping the "If Free" track
 *    would make the Must Do impossible to claim.
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
  // Minutes taken by the Must Do quests that compete for the day.
  let used = 0;

  // What each quest is worth by its own rewards, then lifted to the best
  // quest it unlocks (rule 6).
  const worth = new Map(
    items.map((item) => [
      item.id,
      {
        tier: resolveTier(item, profile, priorities),
        score: bestScore(item, profile, priorities),
        core: priorities.length > 0 || item.value.progression[profile] === "must_do",
      },
    ]),
  );
  for (const item of items) {
    const mine = worth.get(item.id)!;
    const gate = item.requires ? worth.get(item.requires) : undefined;
    if (!gate || gate === mine) continue;
    // The tier is lifted, the score is not: the gate must be done, but it
    // should not jump ahead of quests whose own rewards are better.
    if (TIERS.indexOf(mine.tier) < TIERS.indexOf(gate.tier)) gate.tier = mine.tier;
    gate.core ||= mine.core;
  }

  for (const item of items) {
    const { tier: base, score, core } = worth.get(item.id)!;
    const minutes = dailyMinutes(item);

    if (notOpenYet(item, now)) {
      plans.set(item.id, { tier: base, note: "soon" });
    } else if (claimOnly(item, now)) {
      // Collecting earned rewards is a one-click job nobody should miss.
      plans.set(
        item.id,
        base === "skip" ? { tier: "skip", note: null } : { tier: "must_do", note: "claim" },
      );
    } else if (item.timeCost === "idle") {
      // Not a task that competes for the day: it keeps the tier its rewards earn.
      plans.set(item.id, { tier: base, note: null });
    } else if (minutes <= QUICK_MINUTES && base !== "skip") {
      plans.set(item.id, { tier: "must_do", note: base === "must_do" ? null : "quick" });
    } else if (playtime !== 0 && minutes > playtime && base !== "skip") {
      plans.set(item.id, { tier: demote(base), note: "over" });
    } else if (base === "must_do") {
      // "Core" = what the player asked for. With nothing picked, that is progression.
      competing.push({ item, minutes, score, core });
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
      return plan?.tier === "must_do" && plan.note !== "soon" && plan.note !== "claim";
    })
    .reduce((sum, item) => sum + dailyMinutes(item), 0);
  return Math.round(total);
}
