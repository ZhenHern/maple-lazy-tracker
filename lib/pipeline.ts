import "server-only";
import { cacheLife } from "next/cache";
import { z } from "zod";
import { classifyPost } from "@/lib/classifier/classify";
import { PROMPT_VERSION } from "@/lib/classifier/prompt";
import { trackerItemSchema } from "@/lib/classifier/schema";
import samplePost from "@/lib/fixtures/sample-post.json";
import { candidateImages, nexonImagesEnabled, pickImages } from "@/lib/images";
import { fetchImageSizes, fetchPost, listTrackedPosts } from "@/lib/scraper/nexon";
import type { ClassifiedPost, PostSection, ScrapedPost, TrackerItem } from "@/lib/types";

/** Scrapes the given post, or the latest patch notes when no id is passed. */
export async function scrapePost(sourceId?: string): Promise<ScrapedPost> {
  if (sourceId) return fetchPost(sourceId);
  const latestPatch = (await listTrackedPosts()).find((post) => post.kind === "patch");
  if (!latestPatch) {
    throw new Error("No patch notes found in the Nexon news feed");
  }
  return fetchPost(latestPatch.sourceId);
}

// Matches each item to the pictures under its heading in the post, then asks
// Nexon's CDN for their file sizes so the largest becomes the preview.
async function attachImages(
  items: TrackerItem[],
  sections: PostSection[],
): Promise<TrackerItem[]> {
  const candidates = items.map((item) => candidateImages(item, items.length, sections));
  const sizes = await fetchImageSizes([...new Set(candidates.flat())]);
  return items.map((item, index) => ({ ...item, images: pickImages(candidates[index], sizes) }));
}

// A saved real classification, used for UI work so that page loads cost no
// Gemini quota. The items are re-validated because JSON imports are untyped.
// The file holds no image URLs; when images are on they are read from the live
// post, which costs a Nexon request but no Gemini call.
async function sampleClassifiedPost(): Promise<ClassifiedPost> {
  const { items, kind, ...rest } = samplePost;
  const post: ClassifiedPost = {
    ...rest,
    kind: kind === "event" ? "event" : "patch",
    thumbnailUrl: null,
    items: z.array(trackerItemSchema).parse(items),
  };
  if (!nexonImagesEnabled()) return post;
  try {
    const live = await fetchPost(post.sourceId);
    return {
      ...post,
      thumbnailUrl: live.thumbnailUrl,
      items: await attachImages(post.items, live.sections),
    };
  } catch {
    return post;
  }
}

// Phase 1 stand-in for the Supabase cache: results are memoised per sourceId
// so page refreshes do not trigger a new Gemini call.
export async function getClassifiedPost(sourceId?: string): Promise<ClassifiedPost> {
  "use cache";
  cacheLife("hours");

  if (process.env.TRACKER_FIXTURE === "1" && !sourceId) {
    return sampleClassifiedPost();
  }

  const scraped = await scrapePost(sourceId);
  const { items, model } = await classifyPost(scraped);
  const { text: _text, sections, ...post } = scraped;
  void _text;
  const showImages = nexonImagesEnabled();
  return {
    ...post,
    thumbnailUrl: showImages ? post.thumbnailUrl : null,
    items: showImages ? await attachImages(items, sections) : items,
    model,
    promptVersion: PROMPT_VERSION,
    classifiedAt: new Date().toISOString(),
  };
}
