import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { calibrate } from "@/lib/classifier/calibrate";
import { ratingOf, type Rating } from "@/lib/classifier/models";
import { readAllPosts } from "@/lib/db/store";
import { nexonImagesEnabled } from "@/lib/images";
import { buildOngoing, type OngoingTracker } from "@/lib/ongoing";
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

  return buildOngoing(await readAllPosts(), Date.now(), nexonImagesEnabled());
}

/** One stored post as the archive lists it. */
export interface ArchiveEntry extends PostSummary {
  itemCount: number;
  /** Items that have not ended yet. */
  ongoingCount: number;
  rating: Rating;
}

/** The newest patch notes' publish date: only that patch's permanent items count as current. */
function latestPatchDate(posts: StoredPost[]): string | undefined {
  return posts
    .filter((post) => post.kind === "patch")
    .map((post) => post.publishedAt)
    .sort()
    .at(-1);
}

// The same rule the home page uses, so the archive's "still running" count
// matches what a visitor sees there.
function countRunning(post: StoredPost, now: number, latestPatch: string | undefined): number {
  const current = post.kind !== "patch" || post.publishedAt === latestPatch;
  return post.items.filter((item) =>
    item.endsAt === null ? current : Date.parse(item.endsAt) > now,
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
  const latestPatch = latestPatchDate(posts);
  return posts
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
    .map((post) => ({
      ...toSummary(post, showImages),
      itemCount: post.items.length,
      ongoingCount: countRunning(post, now, latestPatch),
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
      itemCount: stored.items.length,
      ongoingCount: countRunning(stored, now, latestPatchDate(posts)),
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
