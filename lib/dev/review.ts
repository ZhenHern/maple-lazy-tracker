import { calibrate } from "@/lib/classifier/calibrate";
import { normalizeTitle } from "@/lib/images";
import { PROFILES } from "@/lib/classifier/schema";
import { buildOngoing, selectOngoing, type SourcedItem } from "@/lib/ongoing";
import { planDay, plannedMinutes, type Plan, type Playtime } from "@/lib/tiering";
import type { Priority, Profile, StoredPost, Tier, TrackerItem } from "@/lib/types";

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
  steps: string[];
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
      steps: shown.item.steps.map(
        (step) => step.name + (step.reward ? ` (${step.reward})` : ""),
      ),
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

// ---------- Day plans: what each kind of player actually sees ----------

/** The playtimes shown in the plan table (no limit is left out to keep it readable). */
export const PLAN_PLAYTIMES: Playtime[] = [15, 30, 60];

export interface PlanColumn {
  key: string;
  profile: Profile;
  playtime: Playtime;
  /** Minutes a day the Must Do quests of this column add up to. */
  minutes: number;
  mustDo: number;
}

export interface PlanRow {
  id: string;
  title: string;
  timeCost: string;
  startsAt: string | null;
  endsAt: string | null;
  /** The planned tier per column key. */
  cells: Record<string, Plan>;
}

/**
 * The tier of every quest for each job at each playtime, with the given
 * priorities (an empty list is the page's default: all three count). This is
 * the home page's sorting, laid out so every combination can be read at once.
 */
export function buildDayPlans(
  posts: StoredPost[],
  priorities: Priority[],
  now: number,
): { columns: PlanColumn[]; rows: PlanRow[] } {
  const { items } = buildOngoing(posts, now, false);
  const columns: PlanColumn[] = [];
  const rows: PlanRow[] = items.map((item) => ({
    id: item.id,
    title: item.title,
    timeCost: item.timeCost,
    startsAt: item.startsAt,
    endsAt: item.endsAt,
    cells: {},
  }));

  for (const profile of PROFILES) {
    for (const playtime of PLAN_PLAYTIMES) {
      const key = `${profile}-${playtime}`;
      const plans = planDay(items, profile, priorities, playtime, now);
      items.forEach((item, index) => {
        rows[index].cells[key] = plans.get(item.id) ?? { tier: "skip", note: null };
      });
      columns.push({
        key,
        profile,
        playtime,
        minutes: plannedMinutes(items, plans),
        // What the home page's Must Do tab holds: quests under "Soon" are not in it.
        mustDo: items.filter((item) => {
          const plan = plans.get(item.id);
          return plan?.tier === "must_do" && plan.note !== "soon";
        }).length,
      });
    }
  }
  return { columns, rows };
}
