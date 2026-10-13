import { calibrate } from "@/lib/classifier/calibrate";
import { normalizeTitle } from "@/lib/images";
import { selectOngoing, type SourcedItem } from "@/lib/ongoing";
import type { Profile, StoredPost, Tier, TrackerItem } from "@/lib/types";

// Builds the comparison the review page shows: every running quest with its
// live rating, and next to it the rating the latest trial would give. Pure
// code, so it is easy to test.

export const AXES = ["casual", "endgame", "returning", "limited", "cosmetic"] as const;
export type Axis = (typeof AXES)[number];

export interface Rated {
  tier: Tier;
  /** The model's raw 0-100 score behind the tier. */
  score: number;
}

export interface ReviewRow {
  key: string;
  sourceId: string;
  postTitle: string;
  title: string;
  category: string;
  startsAt: string | null;
  endsAt: string | null;
  summary: string;
  why: string;
  rewards: string[];
  time: string | null;
  timeCost: string;
  /** Which model produced the version shown (the trial's when there is one). */
  model: string;
  /** same: no tier moved. changed: at least one did. new/gone: only one side has it. */
  status: "same" | "changed" | "new" | "gone";
  live: Record<Axis, Rated> | null;
  trial: Record<Axis, Rated> | null;
}

function ratings(scored: SourcedItem, tiered: TrackerItem): Record<Axis, Rated> {
  const progression = (profile: Profile) => ({
    tier: tiered.value.progression[profile],
    score: scored.value.progression[profile],
  });
  return {
    casual: progression("casual"),
    endgame: progression("endgame"),
    returning: progression("returning"),
    limited: { tier: tiered.value.limited, score: scored.value.limited },
    cosmetic: { tier: tiered.value.cosmetic, score: scored.value.cosmetic },
  };
}

interface Side {
  item: SourcedItem;
  ratings: Record<Axis, Rated>;
  model: string;
}

// Item ids are slugs the model invents, so they can differ between two runs
// on the same post. The title within a post is the stable handle.
function keyOf(item: SourcedItem): string {
  return `${item.source.sourceId}|${normalizeTitle(item.title)}`;
}

function sideOf(posts: StoredPost[], now: number): Map<string, Side> {
  const { items } = selectOngoing(posts, now, false);
  const tiered = calibrate(items);
  const models = new Map(posts.map((post) => [post.sourceId, post.model]));
  return new Map(
    items.map((item, index) => [
      keyOf(item),
      {
        item,
        ratings: ratings(item, tiered[index]),
        model: models.get(item.source.sourceId) ?? "",
      },
    ]),
  );
}

export interface Review {
  rows: ReviewRow[];
  /** Rows whose status is not "same". */
  differences: number;
}

/**
 * Compares the live posts with the same posts after swapping in `trialPosts`.
 * Tiers are ranked over the whole list, so a trial on one post can move the
 * tier of a quest in another; those rows show up as changed too.
 */
export function buildReview(livePosts: StoredPost[], trialPosts: StoredPost[], now: number): Review {
  const live = sideOf(livePosts, now);
  const trialIds = new Set(trialPosts.map((post) => post.sourceId));
  const trial =
    trialPosts.length > 0
      ? sideOf([...livePosts.filter((post) => !trialIds.has(post.sourceId)), ...trialPosts], now)
      : null;

  const keys = [...new Set([...live.keys(), ...(trial?.keys() ?? [])])];
  const rows = keys.map((key): ReviewRow => {
    const before = live.get(key) ?? null;
    const after = trial?.get(key) ?? null;
    const shown = (after ?? before)!;
    const moved =
      before && after && AXES.some((axis) => before.ratings[axis].tier !== after.ratings[axis].tier);
    const status = !trial || (before && after && !moved)
      ? "same"
      : before && after
        ? "changed"
        : after
          ? "new"
          : "gone";
    return {
      key,
      sourceId: shown.item.source.sourceId,
      postTitle: shown.item.source.title,
      title: shown.item.title,
      category: shown.item.category,
      startsAt: shown.item.startsAt,
      endsAt: shown.item.endsAt,
      summary: shown.item.summary,
      why: shown.item.why,
      rewards: shown.item.rewards,
      time: shown.item.timeEstimate?.label ?? null,
      timeCost: shown.item.timeCost,
      model: shown.model,
      status,
      live: before?.ratings ?? null,
      trial: after?.ratings ?? null,
    };
  });

  // Grouped by post (newest first), differences leading inside each post.
  const order = { changed: 0, new: 1, gone: 2, same: 3 };
  rows.sort(
    (a, b) =>
      Number(b.sourceId) - Number(a.sourceId) ||
      order[a.status] - order[b.status] ||
      a.title.localeCompare(b.title),
  );
  return { rows, differences: rows.filter((row) => row.status !== "same").length };
}
