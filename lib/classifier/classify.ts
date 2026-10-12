import "server-only";
import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import type { ScrapedPost, TrackerItem } from "@/lib/types";
import { buildUserPrompt, SYSTEM_PROMPT } from "./prompt";
import { classificationSchema, geminiResponseSchema } from "./schema";

export function geminiModel(): string {
  return process.env.GEMINI_MODEL || "gemini-flash-latest";
}

// Created on first use, so importing this file never fails when the key is missing.
let client: GoogleGenAI | undefined;
function getClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set. Add it to .env.local (see .env.example).");
  }
  client ??= new GoogleGenAI({ apiKey });
  return client;
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

// IDs key the player's checklist, so they must be clean and unique per post.
function normalizeIds(items: TrackerItem[]): TrackerItem[] {
  const seen = new Map<string, number>();
  return items.map((item) => {
    const base = slugify(item.id);
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);
    return { ...item, id: count === 1 ? base : `${base}-${count}` };
  });
}

export async function classifyPost(post: ScrapedPost): Promise<TrackerItem[]> {
  const response = await getClient().models.generateContent({
    model: geminiModel(),
    contents: buildUserPrompt(post),
    config: {
      systemInstruction: SYSTEM_PROMPT,
      responseMimeType: "application/json",
      responseJsonSchema: geminiResponseSchema,
    },
  });

  const raw = response.text;
  if (!raw) {
    throw new Error(`Gemini returned no text for post ${post.sourceId}`);
  }

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
  return normalizeIds(parsed.data.items);
}
