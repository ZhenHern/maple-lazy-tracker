import "server-only";
import { ApiError, GoogleGenAI } from "@google/genai";
import type { ScrapedPost } from "@/lib/types";
import { fallbackModels, primaryModels } from "./models";
import { buildUserPrompt, SYSTEM_PROMPT } from "./prompt";
import {
  isAvailable,
  parseRateLimit,
  recordCall,
  recordRateLimit,
  waitBeforeCall,
  type QuotaLedger,
} from "./quota";
import { parseReply, type PostClassification } from "./reply";
import { geminiResponseSchema } from "./schema";

// A per-minute refusal clears within a minute. Waiting that long for the good
// model beats an instant answer from a weaker one.
const MAX_RETRY_WAIT = 70_000;

// Created on first use, so importing this file never fails when the key is missing.
let client: GoogleGenAI | undefined;
function getClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set. Add it to .env.local (see .env.example).");
  }
  // The SDK defaults to 5 retries with no timeout, which can hang for minutes
  // when a model is overloaded, and every retry spends quota. We retry ourselves.
  client ??= new GoogleGenAI({
    apiKey,
    httpOptions: { timeout: 120_000, retryOptions: { attempts: 1 } },
  });
  return client;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function generate(model: string, posts: ScrapedPost[]): Promise<string> {
  const response = await getClient().models.generateContent({
    model,
    contents: buildUserPrompt(posts),
    config: {
      systemInstruction: SYSTEM_PROMPT,
      responseMimeType: "application/json",
      responseJsonSchema: geminiResponseSchema,
    },
  });
  if (!response.text) throw new Error(`Gemini (${model}) returned no text`);
  return response.text;
}

export interface BatchOutcome {
  /** The model that answered, or null when none could be reached. */
  model: string | null;
  /** Posts that came back valid, by source id. */
  classified: Map<string, PostClassification>;
  /** Posts the model answered badly, by source id, with the reason. */
  rejected: Map<string, string>;
  /** Requests spent, including refused ones (they count against the quota). */
  requests: number;
  /** Why each model that was tried did not answer. */
  failures: string[];
}

export interface QuotaTracker {
  ledger: QuotaLedger;
  /** Persists the ledger. Called after every request, so a crash loses nothing. */
  save: () => Promise<void>;
}

interface ClassifyOptions {
  /** "primary": trusted models only. "fallback": the weaker backup models. */
  tier: "primary" | "fallback";
  quota: QuotaTracker;
  /** Give up waiting (for rate limits) past this time, in ms. */
  deadline: number;
  /** Try exactly these models instead of the tier's list. For the prompt lab. */
  models?: string[];
}

/**
 * Sends `posts` to Gemini in ONE request and returns each post's items.
 *
 * Models of the chosen tier are tried in order. A model the ledger knows to be
 * out of quota is skipped without spending a request. A per-minute refusal is
 * waited out and retried once on the same model; a per-day refusal moves on.
 */
export async function classifyBatch(
  posts: ScrapedPost[],
  { tier, quota, deadline, models: only }: ClassifyOptions,
): Promise<BatchOutcome> {
  const outcome: BatchOutcome = {
    model: null,
    classified: new Map(),
    rejected: new Map(),
    requests: 0,
    failures: [],
  };
  const models = only ?? (tier === "primary" ? primaryModels() : fallbackModels());

  for (const model of models) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      if (!isAvailable(quota.ledger, model, Date.now())) {
        if (attempt === 0) outcome.failures.push(`${model}: out of quota (skipped, no request spent)`);
        break;
      }
      const wait = waitBeforeCall(quota.ledger, model, Date.now());
      if (Date.now() + wait > deadline) {
        outcome.failures.push(`${model}: no time left to wait for the rate limit`);
        return outcome;
      }
      if (wait > 0) await sleep(wait);

      quota.ledger = recordCall(quota.ledger, model, Date.now());
      outcome.requests += 1;
      await quota.save();

      let raw: string;
      try {
        raw = await generate(model, posts);
      } catch (error) {
        // A bad request or a rejected key fails the same way on every model.
        if (error instanceof ApiError && [400, 401, 403].includes(error.status)) throw error;

        if (error instanceof ApiError && error.status === 429) {
          const limit = parseRateLimit(error.message);
          quota.ledger = recordRateLimit(quota.ledger, model, limit, Date.now());
          await quota.save();
          outcome.failures.push(`${model}: rate limited (${limit.scope})`);
          // With no wait given, a per-minute limit is clear after a minute.
          const waitMs = limit.retryMs ?? 60_000;
          const canWait =
            limit.scope === "minute" &&
            attempt === 0 &&
            waitMs <= MAX_RETRY_WAIT &&
            Date.now() + waitMs < deadline;
          if (canWait) {
            await sleep(waitMs + 500);
            continue;
          }
          break;
        }

        // Overloaded, retired model or timeout: the next model may still answer.
        const reason = error instanceof ApiError ? `HTTP ${error.status}` : String(error);
        outcome.failures.push(`${model}: ${reason}`);
        console.warn(`[classify] ${model} failed: ${reason}`);
        break;
      }

      return { ...outcome, model, ...parseReply(raw, posts) };
    }
  }
  return outcome;
}
