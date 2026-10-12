import "server-only";
import { classifyPost } from "@/lib/classifier/classify";
import { PROMPT_VERSION } from "@/lib/classifier/prompt";
import { readPost, writePost } from "@/lib/db/store";
import { matchRewardImage, pickImages, sectionImages } from "@/lib/images";
import { findItemIcon, latestGmsVersion } from "@/lib/scraper/maplestory-io";
import { fetchImageSizes, fetchPost, listTrackedPosts } from "@/lib/scraper/nexon";
import type { ScoredItem, ScrapedPost, StoredItem } from "@/lib/types";

// Events rarely run longer than this, so older posts cannot hold ongoing items.
const WINDOW_DAYS = 100;
const DAY = 86_400_000;

export interface IngestResult {
  sourceId: string;
  title: string;
  status: "unchanged" | "classified" | "failed" | "deferred";
  detail?: string;
}

/**
 * Attaches pictures to each item. Reward icons come first from the post itself
 * (Nexon names its icon files after the item), then from the other recent
 * posts (`iconPool`), then from maplestory.io by exact item name. The remaining
 * pictures in the item's section become its gallery, largest first.
 */
async function withImages(
  items: ScoredItem[],
  post: ScrapedPost,
  iconPool: string[],
): Promise<StoredItem[]> {
  const allImages = post.sections.flatMap((section) => section.images);
  const version = await latestGmsVersion();
  const iconCache = new Map<string, Promise<string | null>>();
  const lookUp = (reward: string) => {
    if (!version) return Promise.resolve(null);
    if (!iconCache.has(reward)) iconCache.set(reward, findItemIcon(reward, version));
    return iconCache.get(reward)!;
  };

  const drafts = await Promise.all(
    items.map(async (item) => {
      const inSection = sectionImages(item.title, items.length, post.sections);
      const rewardImages = await Promise.all(
        item.rewards.map(
          async (reward) =>
            matchRewardImage(reward, inSection) ??
            matchRewardImage(reward, allImages) ??
            matchRewardImage(reward, iconPool) ??
            (await lookUp(reward)),
        ),
      );
      // A picture already used as a reward icon is not repeated in the gallery.
      const gallery = inSection.filter((url) => !rewardImages.includes(url)).slice(0, 8);
      return { item, rewardImages, gallery };
    }),
  );

  const sizes = await fetchImageSizes([...new Set(drafts.flatMap((draft) => draft.gallery))]);
  return drafts.map(({ item, rewardImages, gallery }) => ({
    ...item,
    rewardImages,
    images: pickImages(gallery, sizes),
  }));
}

/**
 * Brings the store up to date with Nexon's news feed. A post is classified only
 * when it is new, its text changed, or the prompt version moved on. At most
 * `limit` posts are classified per run, to respect Gemini's rate limits; the
 * rest are reported as deferred and picked up by the next run.
 *
 * With `refreshImages`, unchanged posts get their pictures matched again.
 * That costs requests to Nexon and maplestory.io but no Gemini calls.
 */
export async function ingest(limit: number, refreshImages = false): Promise<IngestResult[]> {
  const cutoff = Date.now() - WINDOW_DAYS * DAY;
  const recent = (await listTrackedPosts()).filter(
    (post) => Date.parse(post.publishedAt) >= cutoff,
  );

  // Every recent post is scraped first: the hash check needs the text anyway,
  // and together their images form the pool that reward icons are matched from.
  const scrapes = await Promise.all(
    recent.map(async (summary) => {
      try {
        return { summary, scraped: await fetchPost(summary.sourceId), error: null };
      } catch (error) {
        return { summary, scraped: null, error };
      }
    }),
  );
  const iconPool = [
    ...new Set(
      scrapes.flatMap(({ scraped }) =>
        scraped ? scraped.sections.flatMap((section) => section.images) : [],
      ),
    ),
  ];

  const results: IngestResult[] = [];
  let classified = 0;
  for (const { summary, scraped, error: scrapeError } of scrapes) {
    const base = { sourceId: summary.sourceId, title: summary.title };
    try {
      if (!scraped) throw scrapeError;
      const stored = await readPost(summary.sourceId);
      if (
        stored?.contentHash === scraped.contentHash &&
        stored.promptVersion === PROMPT_VERSION
      ) {
        if (refreshImages) {
          await writePost({ ...stored, items: await withImages(stored.items, scraped, iconPool) });
        }
        results.push({ ...base, status: "unchanged" });
        continue;
      }
      if (classified >= limit) {
        results.push({ ...base, status: "deferred" });
        continue;
      }
      classified += 1;

      const { items, model } = await classifyPost(scraped);
      const { text: _text, sections: _sections, ...post } = scraped;
      void _text;
      void _sections;
      await writePost({
        ...post,
        items: await withImages(items, scraped, iconPool),
        model,
        promptVersion: PROMPT_VERSION,
        classifiedAt: new Date().toISOString(),
      });
      results.push({ ...base, status: "classified", detail: `${items.length} items, ${model}` });
    } catch (error) {
      // The previous stored version, if any, is left untouched.
      results.push({
        ...base,
        status: "failed",
        detail: error instanceof Error ? error.message.slice(0, 300) : "Unknown error",
      });
    }
  }
  return results;
}
