import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { calibrate } from "@/lib/classifier/calibrate";
import { ratingOf, type Rating } from "@/lib/classifier/models";
import { readAllPosts } from "@/lib/db/store";
import { nexonImagesEnabled, sameTitle } from "@/lib/images";
import type { PostSummary, StoredItem, StoredPost, TrackerItem } from "@/lib/types";

export interface OngoingTracker {
  items: TrackerItem[];
  /** Official posts that contributed at least one ongoing item. */
  sources: PostSummary[];
  /** When the newest contributing post was classified, or null if there is no data. */
  updatedAt: string | null;
}

/** The cache tag on everything read from the post store. Ingest revalidates it. */
export const POSTS_TAG = "posts";

// Events rarely run longer than this, so older posts cannot hold ongoing items.
const WINDOW_DAYS = 100;
const DAY = 86_400_000;

// The same event is often described in both the patch notes and its own notice.
// The dedicated notice wins because it is about that one event; among posts of
// the same kind, the newer one wins.
function byPreference(a: StoredPost, b: StoredPost): number {
  if (a.kind !== b.kind) return a.kind === "event" ? -1 : 1;
  return b.publishedAt.localeCompare(a.publishedAt);
}

function stripImages(item: StoredItem): StoredItem {
  return { ...item, images: [], rewardImages: [] };
}

/**
 * Everything running right now, across all stored posts: ended items dropped,
 * duplicates merged, and tiers ranked over the combined list.
 */
export async function getOngoing(): Promise<OngoingTracker> {
  // "use cache" stores this function's result on the server, so visitors do
  // not each trigger a database read. The tag lets the ingest step throw the
  // cached copy away the moment new data is saved; the lifetime is a safety
  // net that also lets ended events drop off within the hour.
  "use cache";
  cacheTag(POSTS_TAG);
  cacheLife("hours");

  const now = Date.now();
  const posts = (await readAllPosts())
    .filter((post) => Date.parse(post.publishedAt) >= now - WINDOW_DAYS * DAY)
    .sort(byPreference);
  const showImages = nexonImagesEnabled();

  const kept: (StoredItem & { source: TrackerItem["source"] })[] = [];
  for (const post of posts) {
    const source = {
      sourceId: post.sourceId,
      title: post.title,
      url: post.url,
      rating: ratingOf(post.model),
    };
    for (const item of post.items) {
      if (item.endsAt !== null && Date.parse(item.endsAt) <= now) continue;
      if (kept.some((existing) => sameTitle(existing.title, item.title))) continue;
      kept.push({
        ...(showImages ? item : stripImages(item)),
        // Item ids are unique per post only, so the post id is added.
        id: `${post.sourceId}-${item.id}`,
        source,
      });
    }
  }

  const contributing = posts.filter((post) =>
    kept.some((item) => item.source.sourceId === post.sourceId),
  );
  return {
    items: calibrate(kept),
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
    updatedAt:
      contributing.map((post) => post.classifiedAt).sort().at(-1) ?? null,
  };
}

/** One stored post as the archive lists it. */
export interface ArchiveEntry extends PostSummary {
  itemCount: number;
  /** Items that have not ended yet. */
  ongoingCount: number;
  rating: Rating;
}

function toSummary(post: StoredPost, showImages: boolean): PostSummary {
  const { sourceId, kind, title, url, publishedAt, thumbnailUrl } = post;
  return { sourceId, kind, title, url, publishedAt, thumbnailUrl: showImages ? thumbnailUrl : null };
}

/** Every stored post, newest first, including ones too old for the home page. */
export async function getArchive(): Promise<ArchiveEntry[]> {
  "use cache";
  cacheTag(POSTS_TAG);
  cacheLife("hours");

  const now = Date.now();
  const showImages = nexonImagesEnabled();
  return (await readAllPosts())
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
    .map((post) => ({
      ...toSummary(post, showImages),
      itemCount: post.items.length,
      ongoingCount: post.items.filter(
        (item) => item.endsAt === null || Date.parse(item.endsAt) > now,
      ).length,
      rating: ratingOf(post.model),
    }));
}

export interface ArchivedPost {
  post: ArchiveEntry;
  /** Every item of the post, ended ones included, ranked against each other. */
  items: TrackerItem[];
  classifiedAt: string;
}

/** One post in full, or null when it is not in the store. */
export async function getArchivedPost(sourceId: string): Promise<ArchivedPost | null> {
  "use cache";
  cacheTag(POSTS_TAG);
  cacheLife("hours");

  const stored = (await readAllPosts()).find((post) => post.sourceId === sourceId);
  if (!stored) return null;

  const now = Date.now();
  const showImages = nexonImagesEnabled();
  const rating = ratingOf(stored.model);
  const source = { sourceId: stored.sourceId, title: stored.title, url: stored.url, rating };
  return {
    post: {
      ...toSummary(stored, showImages),
      itemCount: stored.items.length,
      ongoingCount: stored.items.filter(
        (item) => item.endsAt === null || Date.parse(item.endsAt) > now,
      ).length,
      rating,
    },
    // Here tiers are ranked inside the one post: the archive answers "what
    // mattered in this patch", not "what matters today".
    items: calibrate(
      stored.items.map((item) => ({
        ...(showImages ? item : stripImages(item)),
        id: `${stored.sourceId}-${item.id}`,
        source,
      })),
    ),
    classifiedAt: stored.classifiedAt,
  };
}
