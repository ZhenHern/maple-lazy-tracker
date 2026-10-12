import "server-only";
import { cacheLife } from "next/cache";
import { classifyPost } from "@/lib/classifier/classify";
import { PROMPT_VERSION } from "@/lib/classifier/prompt";
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

// Phase 1 stand-in for the Supabase cache: results are memoised per sourceId
// so page refreshes do not trigger a new Gemini call.
export async function getClassifiedPost(sourceId?: string): Promise<ClassifiedPost> {
  "use cache";
  cacheLife("hours");

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
