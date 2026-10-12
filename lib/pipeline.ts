import "server-only";
import { cacheLife } from "next/cache";
import { z } from "zod";
import { classifyPost } from "@/lib/classifier/classify";
import { PROMPT_VERSION } from "@/lib/classifier/prompt";
import { trackerItemSchema } from "@/lib/classifier/schema";
import samplePost from "@/lib/fixtures/sample-post.json";
import { fetchPost, listTrackedPosts } from "@/lib/scraper/nexon";
import type { ClassifiedPost, ScrapedPost } from "@/lib/types";

/** Scrapes the given post, or the latest patch notes when no id is passed. */
export async function scrapePost(sourceId?: string): Promise<ScrapedPost> {
  if (sourceId) return fetchPost(sourceId);
  const latestPatch = (await listTrackedPosts()).find((post) => post.kind === "patch");
  if (!latestPatch) {
    throw new Error("No patch notes found in the Nexon news feed");
  }
  return fetchPost(latestPatch.sourceId);
}

// A saved real classification, used for UI work so that page loads cost no
// Gemini quota. The items are re-validated because JSON imports are untyped.
function sampleClassifiedPost(): ClassifiedPost {
  const { items, kind, ...rest } = samplePost;
  return {
    ...rest,
    kind: kind === "event" ? "event" : "patch",
    items: z.array(trackerItemSchema).parse(items),
  };
}

// Phase 1 stand-in for the Supabase cache: results are memoised per sourceId
// so page refreshes do not trigger a new Gemini call.
export async function getClassifiedPost(sourceId?: string): Promise<ClassifiedPost> {
  "use cache";
  cacheLife("hours");

  if (process.env.TRACKER_FIXTURE === "1" && !sourceId) {
    return sampleClassifiedPost();
  }

  const { text, ...post } = await scrapePost(sourceId);
  const { items, model } = await classifyPost({ ...post, text });
  return {
    ...post,
    items,
    model,
    promptVersion: PROMPT_VERSION,
    classifiedAt: new Date().toISOString(),
  };
}
