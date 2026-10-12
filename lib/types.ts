import type { z } from "zod";
import type {
  PROFILES,
  TIERS,
  trackerItemSchema,
} from "@/lib/classifier/schema";

export type Tier = (typeof TIERS)[number];
export type Profile = (typeof PROFILES)[number];
export type TrackerItem = z.infer<typeof trackerItemSchema>;

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
