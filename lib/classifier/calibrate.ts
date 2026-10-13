import type { ItemSource, StoredItem, Tier, TrackerItem } from "@/lib/types";

// An item is must_do only if it scores well AND ranks in the top share of the
// list for that axis. The rank cap is what keeps must_do rare even when a
// model scores everything highly.
const MUST_DO_MIN_SCORE = 70;
const IF_FREE_MIN_SCORE = 35;
const MUST_DO_SHARE = 0.25;

function toTiers(scores: number[]): Tier[] {
  const cap = Math.max(1, Math.ceil(scores.length * MUST_DO_SHARE));
  const mustDo = new Set(
    scores
      .map((score, index) => ({ score, index }))
      .sort((a, b) => b.score - a.score)
      .slice(0, cap)
      .filter(({ score }) => score >= MUST_DO_MIN_SCORE)
      .map(({ index }) => index),
  );
  return scores.map((score, index) => {
    if (mustDo.has(index)) return "must_do";
    return score >= IF_FREE_MIN_SCORE ? "if_free" : "skip";
  });
}

type SourcedItem = StoredItem & { source: ItemSource };

/**
 * Turns per-axis scores into tiers, ranking each axis across the whole list.
 * Pass every item the player will see together, so that items from different
 * posts compete for the same must_do slots.
 */
export function calibrate(items: SourcedItem[]): TrackerItem[] {
  const column = (pick: (item: SourcedItem) => number) => toTiers(items.map(pick));
  const progression = {
    casual: column((item) => item.value.progression.casual),
    endgame: column((item) => item.value.progression.endgame),
    returning: column((item) => item.value.progression.returning),
  };
  const limited = column((item) => item.value.limited);
  const cosmetic = column((item) => item.value.cosmetic);

  return items.map((item, index) => ({
    ...item,
    scores: item.value,
    value: {
      progression: {
        casual: progression.casual[index],
        endgame: progression.endgame[index],
        returning: progression.returning[index],
      },
      limited: limited[index],
      cosmetic: cosmetic[index],
    },
  }));
}
