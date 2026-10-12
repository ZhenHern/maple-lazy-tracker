import { z } from "zod";
import type { ScoredItem, ScrapedPost } from "@/lib/types";
import { groundItems } from "./grounding";
import { MAX_ITEMS, MAX_REWARDS, replyEnvelopeSchema, replyItemsSchema } from "./schema";

// Turns Gemini's raw reply into checked items, post by post. Pure code, so it
// can be tested without calling the API.

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
      why: item.why.trim().slice(0, 220),
      // An uncertain estimate must never carry a number, whatever the model sent.
      timeEstimate:
        item.timeEstimate?.basis === "uncertain"
          ? { ...item.timeEstimate, minutesPerWeek: null, effort: null }
          : item.timeEstimate,
    };
  });
}

export interface PostClassification {
  items: ScoredItem[];
  /** Corrections made by the grounding checks. */
  warnings: string[];
}

/** Reads a reply post by post, so one bad post does not discard the others. */
export function parseReply(
  raw: string,
  posts: ScrapedPost[],
): { classified: Map<string, PostClassification>; rejected: Map<string, string> } {
  const classified = new Map<string, PostClassification>();
  const rejected = new Map<string, string>();

  let envelope: z.infer<typeof replyEnvelopeSchema> | null = null;
  try {
    const parsed = replyEnvelopeSchema.safeParse(JSON.parse(raw));
    if (parsed.success) envelope = parsed.data;
  } catch {
    // Not JSON at all: every post is rejected below.
  }

  for (const post of posts) {
    if (!envelope) {
      rejected.set(post.sourceId, "The model's reply was not valid JSON in the expected shape");
      continue;
    }
    const entry = envelope.posts.find((each) => each.sourceId.trim() === post.sourceId);
    if (!entry) {
      rejected.set(post.sourceId, "The model's reply left this post out");
      continue;
    }
    const items = replyItemsSchema.safeParse(entry.items);
    if (!items.success) {
      rejected.set(post.sourceId, `Failed validation: ${z.prettifyError(items.error)}`);
      continue;
    }
    const grounded = groundItems(normalizeItems(items.data.slice(0, MAX_ITEMS)), post);
    if (grounded.items.length === 0) {
      rejected.set(post.sourceId, "No item survived the grounding checks");
      continue;
    }
    classified.set(post.sourceId, grounded);
  }
  return { classified, rejected };
}
