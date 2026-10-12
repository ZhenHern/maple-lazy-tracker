import { z } from "zod";

export const TIERS = ["must_do", "if_free", "skip"] as const;
export const PROFILES = ["new", "casual", "endgame", "returning"] as const;
export const PRIORITIES = ["progression", "limited", "cosmetic"] as const;
export const MAX_ITEMS = 40;
export const MAX_REWARDS = 5;

const tier = z.enum(TIERS);

// .refine() runs only in our own validation; it is not part of the JSON Schema
// sent to Gemini, which supports a limited subset of keywords.
const isoDate = z
  .string()
  .refine((value) => !Number.isNaN(Date.parse(value)), "not a parseable date");

// The item shape is the same for Gemini's reply and for what we store; only the
// rating type differs (a 0-100 score from Gemini, a tier once calibrated).
function itemSchema<Rating extends z.ZodType>(rating: Rating) {
  return z.object({
    id: z.string().min(1),
    title: z.string().min(1),
    category: z.enum(["event", "content", "system"]),
    summary: z.string().min(1),
    // One rating per reason a player might care. The player's chosen priorities
    // decide which of these count (see lib/tiering.ts).
    value: z.object({
      progression: z.object({
        new: rating,
        casual: rating,
        endgame: rating,
        returning: rating,
      }),
      limited: rating,
      cosmetic: rating,
    }),
    rewards: z.array(z.string()),
    startsAt: isoDate.nullable(),
    endsAt: isoDate.nullable(),
    timeEstimate: z
      .object({
        label: z.string().min(1),
        minutesPerWeek: z.number().nonnegative().nullable(),
        effort: z.enum(["low", "medium", "high"]).nullable(),
        // How the estimate was reached. "uncertain" means the post does not
        // give enough to work it out, and no number is shown.
        basis: z.enum(["stated", "calculated", "uncertain"]),
      })
      .nullable(),
  });
}

// What Gemini returns: the item with a 0-100 score on each axis.
export const scoredItemSchema = itemSchema(z.number());

// What we store: Gemini's item plus image URLs. Images come from the post's
// HTML and an item database, never from Gemini. Scores are stored raw and
// turned into tiers at read time, so items from different posts are ranked
// against each other.
export const storedItemSchema = scoredItemSchema.extend({
  images: z.array(z.string()).default([]),
  // Parallel to "rewards": the icon for each reward, or null.
  rewardImages: z.array(z.string().nullable()).default([]),
});

export const storedPostSchema = z.object({
  sourceId: z.string(),
  kind: z.enum(["patch", "event"]),
  title: z.string(),
  url: z.string(),
  publishedAt: z.string(),
  thumbnailUrl: z.string().nullable(),
  contentHash: z.string(),
  items: z.array(storedItemSchema),
  model: z.string(),
  promptVersion: z.number(),
  classifiedAt: z.string(),
});

// Kept only so the tier-valued item type can be derived from it.
export const tieredItemSchema = itemSchema(tier);

export const classificationSchema = z.object({
  items: z.array(scoredItemSchema).min(1),
});

// Gemini rejects this schema with a bare 400 when it carries string-length,
// array-size or numeric-range keywords, so they are removed from the copy it
// receives. Zod still checks them on the reply, and classify.ts trims arrays.
export const geminiResponseSchema: Record<string, unknown> = z.toJSONSchema(
  classificationSchema,
  {
    override: ({ jsonSchema }) => {
      delete jsonSchema.minLength;
      delete jsonSchema.minItems;
      delete jsonSchema.maxItems;
      delete jsonSchema.minimum;
    },
  },
);
delete geminiResponseSchema.$schema;
