import type { z } from "zod";
import type { Rating } from "@/lib/classifier/models";
import type {
  PRIORITIES,
  PROFILES,
  scoredItemSchema,
  storedItemSchema,
  storedPostSchema,
  tieredItemSchema,
  TIERS,
} from "@/lib/classifier/schema";

export type { Rating };
export type Tier = (typeof TIERS)[number];
export type Profile = (typeof PROFILES)[number];
export type Priority = (typeof PRIORITIES)[number];

/** Gemini's reply: an item with a 0-100 score per axis. */
export type ScoredItem = z.infer<typeof scoredItemSchema>;
/** A scored item plus its images, as saved in the store. */
export type StoredItem = z.infer<typeof storedItemSchema>;
export type StoredPost = z.infer<typeof storedPostSchema>;

/** Which official post an item came from, and how far its rating can be trusted. */
export interface ItemSource {
  sourceId: string;
  title: string;
  url: string;
  /** When the post went live. Lets the page mark quests that are new to a visitor. */
  publishedAt: string;
  /**
   * "ai": rated by a trusted model. "backup": rated by a weaker model while the
   * quota was used up, to be redone. "unrated": listed with no AI rating yet.
   */
  rating: Rating;
}

/** What the UI shows: scores resolved to tiers, plus where the item came from. */
export type TrackerItem = Omit<StoredItem, "value"> & {
  value: z.infer<typeof tieredItemSchema>["value"];
  source: ItemSource;
};

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
