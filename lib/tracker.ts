import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { calibrate } from "@/lib/classifier/calibrate";
import { ratingOf, type Rating } from "@/lib/classifier/models";
import { getStore, readAllPosts } from "@/lib/db/store";
import { nexonImagesEnabled } from "@/lib/images";
import { buildOngoing, type OngoingTracker } from "@/lib/ongoing";
import { parseRunLog, RUN_LOG_KEY } from "@/lib/run-log";
import { isTask } from "@/lib/tiering";
import type { PostSummary, StoredItem, StoredPost, TrackerItem } from "@/lib/types";

/** The cache tag on everything read from the post store. Ingest revalidates it. */
export const POSTS_TAG = "posts";

function stripImages(item: StoredItem): StoredItem {
  return { ...item, images: [], rewardImages: [] };
}

/**
 * Everything running right now, across all stored posts. The rules live in
 * lib/ongoing.ts; this function only adds the cache around them.
 */
export async function getOngoing(): Promise<OngoingTracker> {
  // "use cache" stores this function's result on the server, so visitors do
  // not each trigger a database read. The tag lets the ingest step throw the
  // cached copy away the moment new data is saved; the lifetime is a safety
  // net that also lets ended events drop off within the hour.
  "use cache";
  cacheTag(POSTS_TAG);
  cacheLife("hours");

  const [posts, runLog] = await Promise.all([readAllPosts(), readRunLog()]);
  return buildOngoing(posts, Date.now(), nexonImagesEnabled(), runLog?.lastSuccessAt ?? null);
}

// The run log is extra information: if it cannot be read, the page still shows
// the list, with only the rating date.
async function readRunLog() {
  try {
    return parseRunLog(await getStore().readMeta(RUN_LOG_KEY));
  } catch {
    return null;
  }
}

/** One stored post as the archive lists it. */
export interface ArchiveEntry extends PostSummary {
  /** Quests: dated activities. Changes with no deadline are counted apart. */
  itemCount: number;
  /** System changes and permanent content: news, with nothing to do. */
  newsCount: number;
  /** Quests that have not ended yet. */
  ongoingCount: number;
  rating: Rating;
}

// Quests whose deadline (or claim deadline) is still ahead. News has no
// deadline and is never "running".
function countRunning(post: StoredPost, now: number): number {
  return post.items.filter(
    (item) => isTask(item) && Date.parse(item.claimUntil ?? item.endsAt!) > now,
  ).length;
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
  const posts = await readAllPosts();
  return posts
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
    .map((post) => ({
      ...toSummary(post, showImages),
      itemCount: post.items.filter(isTask).length,
      newsCount: post.items.filter((item) => !isTask(item)).length,
      ongoingCount: countRunning(post, now),
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

  const posts = await readAllPosts();
  const stored = posts.find((post) => post.sourceId === sourceId);
  if (!stored) return null;

  const now = Date.now();
  const showImages = nexonImagesEnabled();
  const rating = ratingOf(stored.model);
  const source = {
    sourceId: stored.sourceId,
    title: stored.title,
    url: stored.url,
    publishedAt: stored.publishedAt,
    rating,
  };
  return {
    post: {
      ...toSummary(stored, showImages),
      itemCount: stored.items.filter(isTask).length,
      newsCount: stored.items.filter((item) => !isTask(item)).length,
      ongoingCount: countRunning(stored, now),
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
