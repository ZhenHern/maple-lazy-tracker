import { calibrate } from "@/lib/classifier/calibrate";
import { ratingOf } from "@/lib/classifier/models";
import { sameTitle } from "@/lib/images";
import type { ItemSource, PostSummary, StoredItem, StoredPost, TrackerItem } from "@/lib/types";

// Turns stored posts into the list of quests that are running now. Pure code:
// it takes the posts and the time as arguments, so the home page (through a
// cache), the calendar and the prompt lab can all share the exact same rules,
// and tests can run it without a server.

// Events rarely run longer than this, so older posts cannot hold ongoing items.
const WINDOW_DAYS = 100;
const DAY = 86_400_000;

/** A change that is not a task: shown as news, never given a tier. */
export interface NewsItem {
  id: string;
  title: string;
  category: StoredItem["category"];
  summary: string;
  source: ItemSource;
}

export interface OngoingTracker {
  /** Quests: activities with an end date. Only these get tiers. */
  items: TrackerItem[];
  /** System changes and permanent content of the current patch, untiered. */
  news: NewsItem[];
  /** Official posts that contributed at least one ongoing item. */
  sources: PostSummary[];
  /** When the newest contributing post was classified, or null if there is no data. */
  updatedAt: string | null;
}

/** A stored item (raw 0-100 scores) plus where it came from. */
export type SourcedItem = StoredItem & { source: ItemSource };

// The same event is often described in both the patch notes and its own notice.
// The dedicated notice wins because it is about that one event; among posts of
// the same kind, the newer one wins.
function byPreference(a: StoredPost, b: StoredPost): number {
  if (a.kind !== b.kind) return a.kind === "event" ? -1 : 1;
  return b.publishedAt.localeCompare(a.publishedAt);
}

function sameDeadline(a: string | null, b: string | null): boolean {
  if (a === null || b === null) return true;
  return Math.abs(Date.parse(a) - Date.parse(b)) <= 2 * DAY;
}

function stripImages(item: StoredItem): StoredItem {
  return { ...item, images: [], rewardImages: [] };
}

// A quest is something to do before a deadline. A system change or a piece
// of permanent content is not: there is nothing to "skip" or to do "if free",
// so giving it a tier makes no sense. Those are listed separately as news.
function isQuest(item: StoredItem): boolean {
  return item.endsAt !== null && item.category !== "system";
}

/**
 * What is current at `now`, still carrying raw scores: ended items dropped,
 * stale permanent items hidden, cross-post repeats merged. `items` are the
 * quests (dated activities); `news` is everything else.
 */
export function selectOngoing(
  allPosts: StoredPost[],
  now: number,
  showImages: boolean,
): { items: SourcedItem[]; news: SourcedItem[]; contributing: StoredPost[] } {
  const posts = [...allPosts].sort(byPreference);
  // Posts older than this no longer contribute permanent items. A dated item
  // stays until it ends, however old its post is: a long event must not drop
  // off the list while it is still running.
  const cutoff = now - WINDOW_DAYS * DAY;

  // Permanent content and system changes have no end date, so without a rule
  // they would sit in the list for months. They are news of the current patch:
  // once newer patch notes exist, the older patch's permanent items drop out.
  const latestPatch = posts
    .filter((post) => post.kind === "patch")
    .map((post) => post.publishedAt)
    .sort()
    .at(-1);

  const items: SourcedItem[] = [];
  for (const post of posts) {
    const stale =
      (post.kind === "patch" && post.publishedAt !== latestPatch) ||
      Date.parse(post.publishedAt) < cutoff;
    const source: ItemSource = {
      sourceId: post.sourceId,
      title: post.title,
      url: post.url,
      publishedAt: post.publishedAt,
      rating: ratingOf(post.model),
    };
    for (const item of post.items) {
      if (item.endsAt !== null && Date.parse(item.endsAt) <= now) continue;
      if (item.endsAt === null && stale) continue;
      // A repeat is the same title in ANOTHER post (the patch notes and the
      // event's own notice). Inside one post, "Operation: Dive" and
      // "Operation: Dive Dungeon" are two activities and both stay.
      // Matching titles are not enough when both give an end date and the
      // dates are far apart: those are two runs of a recurring event.
      const repeat = items.some(
        (existing) =>
          existing.source.sourceId !== post.sourceId &&
          sameTitle(existing.title, item.title) &&
          sameDeadline(existing.endsAt, item.endsAt),
      );
      if (repeat) continue;
      items.push({
        ...(showImages ? item : stripImages(item)),
        // Item ids are unique per post only, so the post id is added.
        id: `${post.sourceId}-${item.id}`,
        source,
      });
    }
  }

  const contributing = posts.filter((post) =>
    items.some((item) => item.source.sourceId === post.sourceId),
  );
  return {
    items: items.filter(isQuest),
    news: items.filter((item) => !isQuest(item)),
    contributing,
  };
}

/** `selectOngoing`, then tiers ranked over the combined list. */
export function buildOngoing(
  allPosts: StoredPost[],
  now: number,
  showImages: boolean,
): OngoingTracker {
  const { items, news, contributing } = selectOngoing(allPosts, now, showImages);
  return {
    // Tiers are ranked among quests only, so news never takes a Must Do slot.
    items: calibrate(items),
    news: news.map(({ id, title, category, summary, source }) => ({
      id,
      title,
      category,
      summary,
      source,
    })),
    sources: contributing
      .map(({ sourceId, kind, title, url, publishedAt, thumbnailUrl }) => ({
        sourceId,
        kind,
        title,
        url,
        publishedAt,
        thumbnailUrl: showImages ? thumbnailUrl : null,
      }))
      .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)),
    updatedAt: contributing.map((post) => post.classifiedAt).sort().at(-1) ?? null,
  };
}
