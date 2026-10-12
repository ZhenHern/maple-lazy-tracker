import type { z } from "zod";
import type {
  PRIORITIES,
  PROFILES,
  scoredItemSchema,
  TIERS,
  trackerItemSchema,
} from "@/lib/classifier/schema";

export type Tier = (typeof TIERS)[number];
export type Profile = (typeof PROFILES)[number];
export type Priority = (typeof PRIORITIES)[number];
export type TrackerItem = z.infer<typeof trackerItemSchema>;
export type ScoredItem = z.infer<typeof scoredItemSchema>;

export type PostKind = "patch" | "event";

export interface PostSummary {
  sourceId: string;
  kind: PostKind;
  title: string;
  url: string;
  publishedAt: string;
}

export interface ScrapedPost extends PostSummary {
  text: string;
  contentHash: string;
}

export interface ClassifiedPost extends PostSummary {
  contentHash: string;
  items: TrackerItem[];
  model: string;
  promptVersion: number;
  classifiedAt: string;
}
