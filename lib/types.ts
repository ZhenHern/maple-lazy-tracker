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
  /** Banner image on Nexon's CDN, or null when images are switched off. */
  thumbnailUrl: string | null;
}

/** One headed section of a post and the image URLs found under it. */
export interface PostSection {
  heading: string;
  images: string[];
}

export interface ScrapedPost extends PostSummary {
  text: string;
  contentHash: string;
  sections: PostSection[];
}

export interface ClassifiedPost extends PostSummary {
  contentHash: string;
  items: TrackerItem[];
  model: string;
  promptVersion: number;
  classifiedAt: string;
}
