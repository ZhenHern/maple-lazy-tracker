import "server-only";
import { ApiError, GoogleGenAI } from "@google/genai";
import { z } from "zod";
import type { ScoredItem, ScrapedPost } from "@/lib/types";
import { buildUserPrompt, SYSTEM_PROMPT } from "./prompt";
import {
  classificationSchema,
  geminiResponseSchema,
  MAX_ITEMS,
  MAX_REWARDS,
} from "./schema";

const DEFAULT_MODELS = "gemini-3.6-flash,gemini-3.8-flash,gemini-3.7-flash,gemini-3.5-flash-lite";

/** Models to try, in order. GEMINI_MODEL is a comma-separated list. */
function geminiModels(): string[] {
  return (process.env.GEMINI_MODEL || DEFAULT_MODELS)
    .split(",")
    .map((model) => model.trim())
    .filter(Boolean);
}

// Created on first use, so importing this file never fails when the key is missing.
let client: GoogleGenAI | undefined;
function getClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set. Add it to .env.local (see .env.example).");
  }
  // The SDK defaults to 5 retries with no timeout, which can hang for minutes
  // when a model is overloaded. Fail fast and move on to the next model instead.
  client ??= new GoogleGenAI({
    apiKey,
    httpOptions: { timeout: 120_000, retryOptions: { attempts: 1 } },
  });
  return client;
}

// A bad request or a rejected key fails the same way on every model, so only
// other failures (overloaded, rate limited, retired model, timeout) fall through.
function shouldTryNextModel(error: unknown): boolean {
  return !(error instanceof ApiError && [400, 401, 403].includes(error.status));
}

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "item"
  );
}

// IDs must be clean and unique per post. Array caps are applied here because
// Gemini cannot be given them in the schema.
function normalizeItems(items: ScoredItem[]): ScoredItem[] {
  const seen = new Map<string, number>();
  return items.map((item) => {
    const base = slugify(item.id);
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);
    return {
      ...item,
      id: count === 1 ? base : `${base}-${count}`,
      rewards: item.rewards.slice(0, MAX_REWARDS),
      // An uncertain estimate must never carry a number, whatever the model sent.
      timeEstimate:
        item.timeEstimate?.basis === "uncertain"
          ? { ...item.timeEstimate, minutesPerWeek: null, effort: null }
          : item.timeEstimate,
    };
  });
}

async function generate(model: string, post: ScrapedPost): Promise<string> {
  const response = await getClient().models.generateContent({
    model,
    contents: buildUserPrompt(post),
    config: {
      systemInstruction: SYSTEM_PROMPT,
      responseMimeType: "application/json",
      responseJsonSchema: geminiResponseSchema,
    },
  });
  if (!response.text) {
    throw new Error(`Gemini (${model}) returned no text for post ${post.sourceId}`);
  }
  return response.text;
}

function parseItems(raw: string, post: ScrapedPost): ScoredItem[] {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new Error(`Gemini returned invalid JSON for post ${post.sourceId}`);
  }

  const parsed = classificationSchema.safeParse(json);
  if (!parsed.success) {
    throw new Error(
      `Gemini output failed validation for post ${post.sourceId}: ${z.prettifyError(parsed.error)}`,
    );
  }
  return normalizeItems(parsed.data.items.slice(0, MAX_ITEMS));
}

export async function classifyPost(
  post: ScrapedPost,
): Promise<{ items: ScoredItem[]; model: string }> {
  const failures: string[] = [];
  for (const model of geminiModels()) {
    let raw: string;
    try {
      raw = await generate(model, post);
    } catch (error) {
      if (!shouldTryNextModel(error)) throw error;
      const reason = error instanceof ApiError ? `HTTP ${error.status}` : String(error);
      failures.push(`${model}: ${reason}`);
      console.warn(`[classify] ${model} failed for post ${post.sourceId}: ${reason}`);
      continue;
    }
    return { items: parseItems(raw, post), model };
  }
  throw new Error(`Every Gemini model failed for post ${post.sourceId} (${failures.join("; ")})`);
}
