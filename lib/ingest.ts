import "server-only";
import { planBatches } from "@/lib/classifier/batch";
import { classifyBatch, type QuotaTracker } from "@/lib/classifier/classify";
import { fallbackModels, isProvisional, primaryModels, RULES_MODEL } from "@/lib/classifier/models";
import { PROMPT_VERSION } from "@/lib/classifier/prompt";
import { describeLedger, emptyLedger, ledgerSchema } from "@/lib/classifier/quota";
import { rulesClassify } from "@/lib/classifier/rules";
import { getStore, writePost } from "@/lib/db/store";
import { groundItems } from "@/lib/classifier/grounding";
import { matchRewardImage, pickImages, sectionImages } from "@/lib/images";
import { isEffect, rewardName, singular } from "@/lib/reward-name";
import { findItemIcon, latestGmsVersion } from "@/lib/scraper/maplestory-io";
import { fetchImageSizes, fetchPost, listTrackedPosts } from "@/lib/scraper/nexon";
import type { PostSummary, ScoredItem, ScrapedPost, StoredItem, StoredPost } from "@/lib/types";

// Events rarely run longer than this, so older posts cannot hold ongoing items.
const WINDOW_DAYS = 100;
const DAY = 86_400_000;

const QUOTA_KEY = "gemini-quota";

export interface IngestResult {
  sourceId: string;
  title: string;
  /**
   * unchanged: nothing to do. classified: rated by a trusted model.
   * provisional: rated by a backup model, to be redone. unrated: listed
   * without an AI rating. deferred: waiting for a later run. failed: an error.
   */
  status: "unchanged" | "classified" | "provisional" | "unrated" | "failed" | "deferred";
  detail?: string;
}

export interface IngestReport {
  results: IngestResult[];
  /** Gemini requests spent in this run, including refused ones. */
  requests: number;
  /** Each model's use of today's quota after the run. */
  quota: string;
}

export interface IngestOptions {
  /** Most Gemini requests this run may spend. One request carries several posts. */
  maxRequests: number;
  /** Re-match pictures on unchanged posts (costs no Gemini requests). */
  refreshImages?: boolean;
  /**
   * Run the grounding checks again on what is stored, with no AI call. For
   * when a check was added or sharpened and stored ratings should get it now.
   */
  recheck?: boolean;
  /** Stop starting new work after this time (ms). Keeps a cron run inside its time limit. */
  deadline?: number;
}

/**
 * Attaches pictures to each item. Reward icons come first from the post itself
 * (Nexon names its icon files after the item), then from the other recent
 * posts (`iconPool`), then from maplestory.io by item name. The remaining
 * pictures in the item's section become its gallery, largest first.
 */
export async function withImages(
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
        item.rewards.map(async (reward) => {
          // Nexon names its icon files after the item, so the wording around
          // the name ("Up to 500 ... per claim") is taken off before matching.
          const name = singular(rewardName(reward).plain) || reward;
          // A discount or a buff is not an item, whatever item it mentions.
          if (isEffect(reward)) return null;
          return (
            matchRewardImage(reward, inSection) ??
            matchRewardImage(name, inSection) ??
            matchRewardImage(reward, allImages) ??
            matchRewardImage(name, allImages) ??
            matchRewardImage(reward, iconPool) ??
            matchRewardImage(name, iconPool) ??
            (await lookUp(reward))
          );
        }),
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

/** A post that needs classifying, and how urgently. */
interface Job {
  summary: PostSummary;
  scraped: ScrapedPost;
  stored: StoredPost | null;
  /** Lower runs first. */
  priority: number;
  /** May a backup model do this job when the trusted ones are out of quota? */
  allowFallback: boolean;
  reason: string;
  /** Read by planBatches to size the request. */
  text: string;
}

/**
 * Decides whether a post needs a Gemini call. The rule on fallbacks: a backup
 * model may fill a gap (a new post, or one that has no rating yet), but it may
 * never overwrite a result that is already as good or better than its own.
 */
function planJob(
  scraped: ScrapedPost,
  stored: StoredPost | null,
): Pick<Job, "priority" | "allowFallback" | "reason"> | null {
  if (!stored) return { priority: 0, allowFallback: true, reason: "new post" };
  if (stored.model === RULES_MODEL) {
    return { priority: 1, allowFallback: true, reason: "not rated yet" };
  }
  const provisional = isProvisional(stored.model);
  if (stored.contentHash !== scraped.contentHash) {
    return { priority: 2, allowFallback: provisional, reason: "text changed" };
  }
  if (provisional) {
    return { priority: 3, allowFallback: false, reason: `rated by backup model ${stored.model}` };
  }
  if (stored.promptVersion !== PROMPT_VERSION) {
    return { priority: 4, allowFallback: false, reason: "prompt updated" };
  }
  return null;
}

export async function loadQuota(): Promise<QuotaTracker> {
  const store = getStore();
  let saved: unknown = null;
  try {
    saved = await store.readMeta(QUOTA_KEY);
  } catch {
    // An unreadable ledger only costs us the memory of earlier refusals.
  }
  const parsed = ledgerSchema.safeParse(saved);
  const tracker: QuotaTracker = {
    ledger: parsed.success ? parsed.data : emptyLedger(),
    save: async () => {
      try {
        await store.writeMeta(QUOTA_KEY, tracker.ledger);
      } catch (error) {
        console.warn("[ingest] could not save the quota ledger:", error);
      }
    },
  };
  return tracker;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 300) : "Unknown error";
}

/**
 * Brings the store up to date with Nexon's news feed.
 *
 * A post needs a Gemini call when it is new, its text changed, the prompt
 * moved on, or its current rating came from a backup model. Posts are queued
 * by urgency and packed several to a request; at most `maxRequests` requests
 * are spent, and whatever is left is reported as deferred for the next run.
 *
 * When no model can answer, a new event notice is still listed, unrated, so
 * players learn it exists. Nothing already stored is ever replaced by a worse
 * result.
 */
export async function ingest({
  maxRequests,
  refreshImages = false,
  recheck = false,
  deadline = Date.now() + 9 * 60_000,
}: IngestOptions): Promise<IngestReport> {
  const store = getStore();
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

  const storedById = new Map((await store.readAllPosts()).map((post) => [post.sourceId, post]));
  const results = new Map<string, IngestResult>();
  const report = (summary: PostSummary, status: IngestResult["status"], detail?: string) =>
    results.set(summary.sourceId, {
      sourceId: summary.sourceId,
      title: summary.title,
      status,
      ...(detail ? { detail } : {}),
    });

  const jobs: Job[] = [];
  for (const { summary, scraped, error } of scrapes) {
    if (!scraped) {
      report(summary, "failed", messageOf(error));
      continue;
    }
    let stored = storedById.get(summary.sourceId) ?? null;
    // Done for every stored post, not only up-to-date ones: a post waiting for
    // quota should not also have to wait for better pictures.
    if (stored && (refreshImages || recheck)) {
      let items: ScoredItem[] = stored.items;
      let warnings = stored.warnings;
      if (recheck && stored.model !== RULES_MODEL) {
        const grounded = groundItems(items, scraped);
        // An empty result means the check went wrong, not the post.
        if (grounded.items.length > 0) {
          items = grounded.items;
          warnings = [...new Set([...warnings, ...grounded.warnings])];
        }
      }
      stored = { ...stored, warnings, items: await withImages(items, scraped, iconPool) };
      await writePost(stored);
    }
    const plan = planJob(scraped, stored);
    if (plan) {
      jobs.push({ summary, scraped, stored, text: scraped.text, ...plan });
      continue;
    }
    report(summary, "unchanged");
  }
  jobs.sort(
    (a, b) =>
      a.priority - b.priority || b.summary.publishedAt.localeCompare(a.summary.publishedAt),
  );

  const save = async (job: Job, items: ScoredItem[], model: string, warnings: string[]) => {
    const { text: _text, sections: _sections, ...post } = job.scraped;
    void _text;
    void _sections;
    await writePost({
      ...post,
      items: await withImages(items, job.scraped, iconPool),
      model,
      promptVersion: PROMPT_VERSION,
      classifiedAt: new Date().toISOString(),
      warnings,
      error: null,
    });
  };

  const quota = await loadQuota();
  let requests = 0;
  // Jobs no model has settled yet, with the reason to show if none does.
  const unsettled = new Map<Job, string>(
    jobs.map((job) => [job, "request limit for this run reached"]),
  );
  // Jobs a model answered badly. They are not retried in this run.
  const rejected = new Map<Job, string>();

  batches: for (const batch of planBatches(jobs)) {
    for (const tier of ["primary", "fallback"] as const) {
      if (requests >= maxRequests || Date.now() >= deadline) break batches;
      const eligible = tier === "primary" ? batch : batch.filter((job) => job.allowFallback);
      if (eligible.length === 0) break;

      let outcome;
      try {
        outcome = await classifyBatch(
          eligible.map((job) => job.scraped),
          { tier, quota, deadline },
        );
      } catch (error) {
        // A rejected key or a malformed request would fail every batch the same way.
        for (const job of unsettled.keys()) unsettled.set(job, messageOf(error));
        break batches;
      }
      // The run's budget is for requests that were answered. Attempts on a
      // model that turned out to be overloaded are not charged when another
      // model then answered, or three busy models would end the run after
      // one batch.
      requests += outcome.model ? 1 : outcome.requests;

      if (!outcome.model) {
        // Nobody of this tier answered. The fallback tier gets the jobs it may take.
        for (const job of eligible) unsettled.set(job, outcome.failures.join("; "));
        continue;
      }
      for (const job of eligible) {
        const answer = outcome.classified.get(job.summary.sourceId);
        unsettled.delete(job);
        if (!answer) {
          rejected.set(
            job,
            outcome.rejected.get(job.summary.sourceId) ?? "No answer for this post",
          );
          continue;
        }
        try {
          await save(job, answer.items, outcome.model, answer.warnings);
          const corrections = answer.warnings.length
            ? `, ${answer.warnings.length} corrections`
            : "";
          report(
            job.summary,
            tier === "primary" ? "classified" : "provisional",
            `${answer.items.length} items, ${outcome.model}${corrections} (${job.reason})`,
          );
        } catch (error) {
          report(job.summary, "failed", messageOf(error));
        }
      }
      break;
    }
  }

  // Whatever no model settled. The old version, if there is one, stays live.
  for (const [job, reason] of [...rejected, ...unsettled]) {
    try {
      if (!job.stored && job.scraped.kind === "event") {
        await save(job, rulesClassify(job.scraped), RULES_MODEL, []);
        report(job.summary, "unrated", `listed without a rating: ${reason}`);
      } else if (rejected.has(job)) {
        await store.recordError(job.summary.sourceId, reason);
        report(job.summary, "failed", reason);
      } else {
        report(job.summary, "deferred", `${job.reason}; ${reason}`);
      }
    } catch (error) {
      report(job.summary, "failed", messageOf(error));
    }
  }

  return {
    // In the feed's order, newest first.
    results: scrapes.flatMap(({ summary }) => results.get(summary.sourceId) ?? []),
    requests,
    quota: describeLedger(quota.ledger, [...primaryModels(), ...fallbackModels()], Date.now()),
  };
}
