import { PRIORITIES, TIERS } from "@/lib/classifier/schema";
import type { Priority, Profile, Tier, TrackerItem } from "@/lib/types";

/**
 * The tier a player sees for an item: the best rating among the priorities
 * they care about. With no priorities chosen, all three count.
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
