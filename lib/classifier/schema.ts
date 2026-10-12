import { z } from "zod";

export const TIERS = ["must_do", "if_free", "skip"] as const;
export const PROFILES = ["new", "casual", "endgame", "returning"] as const;
export const MAX_ITEMS = 40;
export const MAX_REWARDS = 5;

const tier = z.enum(TIERS);

// .refine() runs only in our own validation; it is not part of the JSON Schema
// sent to Gemini, which supports a limited subset of keywords.
const isoDate = z
  .string()
  .refine((value) => !Number.isNaN(Date.parse(value)), "not a parseable date");

export const trackerItemSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  summary: z.string().min(1),
  tiers: z.object({
    new: tier,
    casual: tier,
    endgame: tier,
    returning: tier,
  }),
  rewards: z.array(z.string()),
  startsAt: isoDate.nullable(),
  endsAt: isoDate.nullable(),
  timeEstimate: z
    .object({
      label: z.string().min(1),
      effort: z.enum(["low", "medium", "high"]),
    })
    .nullable(),
});

export const classificationSchema = z.object({
  items: z.array(trackerItemSchema).min(1),
});

// Gemini rejects this schema with a bare 400 when it carries string-length or
// array-size keywords, so they are removed from the copy it receives. Zod still
// checks minimums on the reply, and classify.ts trims arrays to their caps.
export const geminiResponseSchema: Record<string, unknown> = z.toJSONSchema(
  classificationSchema,
  {
    override: ({ jsonSchema }) => {
      delete jsonSchema.minLength;
      delete jsonSchema.minItems;
      delete jsonSchema.maxItems;
    },
  },
);
delete geminiResponseSchema.$schema;
