import "server-only";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { planBatches } from "@/lib/classifier/batch";
import { classifyBatch } from "@/lib/classifier/classify";
import { PROMPT_VERSION } from "@/lib/classifier/prompt";
import { storedPostSchema } from "@/lib/classifier/schema";
import { writePost } from "@/lib/db/store";
import { loadQuota, withImages } from "@/lib/ingest";
import { fetchPost } from "@/lib/scraper/nexon";
import type { ScrapedPost, StoredPost } from "@/lib/types";

// The prompt lab's engine. A "trial" runs the CURRENT prompt on chosen posts
// and keeps the answer in a side file instead of the live store, so a prompt
// change can be judged before it replaces anything. If the trial looks right
// it can be promoted, which saves it as the live data without spending the
// requests a second time.
//
// Development only: trials live in .data/trials/ on this machine.

const TRIAL_FILE = path.join(process.cwd(), ".data", "trials", "latest.json");

const trialSchema = z.object({
  id: z.string(),
  createdAt: z.string(),
  promptVersion: z.number(),
  /** Which models were allowed: the trusted ones or the backup ones. */
  tier: z.enum(["primary", "fallback"]),
  /** Models that answered, in order of use. Empty when none did. */
  models: z.array(z.string()),
  requests: z.number(),
  /** The classified posts, in the same shape as the live store. */
  posts: z.array(storedPostSchema),
  /** Posts that got no usable answer, with the reason. */
  problems: z.record(z.string(), z.string()),
});
export type Trial = z.infer<typeof trialSchema>;

interface TrialOptions {
  ids: string[];
  tier: "primary" | "fallback";
  /** Most Gemini requests to spend. Posts beyond that are reported, not run. */
  maxRequests: number;
  /** Try exactly this model, whatever the configured lists say. */
  model?: string;
}

export async function runTrial({ ids, tier, maxRequests, model }: TrialOptions): Promise<Trial> {
  const problems: Record<string, string> = {};
  const scraped: ScrapedPost[] = [];
  for (const id of ids) {
    try {
      scraped.push(await fetchPost(id));
    } catch (error) {
      problems[id] = error instanceof Error ? error.message.slice(0, 200) : "Could not fetch";
    }
  }

  const quota = await loadQuota();
  const deadline = Date.now() + 8 * 60_000;
  const posts: StoredPost[] = [];
  const models: string[] = [];
  let requests = 0;

  for (const batch of planBatches(scraped)) {
    if (requests >= maxRequests) {
      for (const post of batch) problems[post.sourceId] = "Not run: request limit for this trial reached";
      continue;
    }
    const outcome = await classifyBatch(batch, {
      tier,
      quota,
      deadline,
      ...(model ? { models: [model] } : {}),
    });
    requests += outcome.requests;
    if (!outcome.model) {
      for (const post of batch) problems[post.sourceId] = outcome.failures.join("; ");
      continue;
    }
    if (!models.includes(outcome.model)) models.push(outcome.model);
    for (const post of batch) {
      const answer = outcome.classified.get(post.sourceId);
      if (!answer) {
        problems[post.sourceId] = outcome.rejected.get(post.sourceId) ?? "No answer for this post";
        continue;
      }
      const { text: _text, sections: _sections, ...summary } = post;
      void _text;
      void _sections;
      posts.push({
        ...summary,
        // Pictures are matched from the post itself only; the cross-post icon
        // pool is an ingest-time extra that a trial does not need.
        items: await withImages(answer.items, post, []),
        model: outcome.model,
        promptVersion: PROMPT_VERSION,
        classifiedAt: new Date().toISOString(),
        warnings: answer.warnings,
        error: null,
      });
    }
  }

  const trial: Trial = {
    id: new Date().toISOString().replace(/[:.]/g, "-"),
    createdAt: new Date().toISOString(),
    promptVersion: PROMPT_VERSION,
    tier,
    models,
    requests,
    posts,
    problems,
  };
  // A trial that classified nothing (every model refused) must not wipe out
  // the last good one: those requests were paid for and can still be promoted.
  if (posts.length > 0) {
    // Posts the previous trial covered and this one did not are carried over,
    // as long as both ran the same prompt. A patch post that succeeded is not
    // lost when the event notices are retried on their own.
    const previous = await readLatestTrial();
    const fresh = new Set(posts.map((post) => post.sourceId));
    const carried =
      previous && previous.promptVersion === PROMPT_VERSION
        ? previous.posts.filter((post) => !fresh.has(post.sourceId))
        : [];
    const saved: Trial = { ...trial, posts: [...carried, ...posts] };
    await mkdir(path.dirname(TRIAL_FILE), { recursive: true });
    await writeFile(TRIAL_FILE, `${JSON.stringify(saved, null, 2)}\n`);
  }
  return trial;
}

/** The most recent trial, or null when there is none (or it no longer validates). */
export async function readLatestTrial(): Promise<Trial | null> {
  try {
    const parsed = trialSchema.safeParse(JSON.parse(await readFile(TRIAL_FILE, "utf8")));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Saves the latest trial's posts as the live data. Returns the ids written. */
export async function promoteLatestTrial(): Promise<string[]> {
  const trial = await readLatestTrial();
  if (!trial) return [];
  for (const post of trial.posts) await writePost(post);
  return trial.posts.map((post) => post.sourceId);
}
