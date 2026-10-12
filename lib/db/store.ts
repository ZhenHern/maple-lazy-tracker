import "server-only";
import path from "node:path";
import type { StoredPost } from "@/lib/types";
import { fileStore, readPostsFrom } from "./file-store";
import { supabaseStore } from "./supabase-store";

/**
 * Where classified posts are kept. Two implementations share this shape, so
 * the rest of the app never knows which one it is talking to (the same idea as
 * a Spring `Repository` interface with two beans behind it).
 */
export interface PostStore {
  name: "file" | "supabase";
  readAllPosts(): Promise<StoredPost[]>;
  readPost(sourceId: string): Promise<StoredPost | null>;
  writePost(post: StoredPost): Promise<void>;
  /** Notes a failed refresh on a post without touching its items. */
  recordError(sourceId: string, message: string): Promise<void>;
  /** Small named JSON values, such as the Gemini quota ledger. */
  readMeta(key: string): Promise<unknown>;
  writeMeta(key: string, value: unknown): Promise<void>;
}

// Committed sample data, shown when nothing has been ingested yet.
const SEED_DIR = path.join(process.cwd(), "data", "seed");

/** Supabase when it is configured, otherwise JSON files under .data/. */
export function getStore(): PostStore {
  return process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
    ? supabaseStore
    : fileStore;
}

/** Every stored post. Falls back to the committed seed data when the store is empty. */
export async function readAllPosts(): Promise<StoredPost[]> {
  const stored = await getStore().readAllPosts();
  return stored.length > 0 ? stored : readPostsFrom(SEED_DIR);
}

export function writePost(post: StoredPost): Promise<void> {
  if (!/^\d+$/.test(post.sourceId)) {
    throw new Error(`Refusing to store a post with a non-numeric id: ${post.sourceId}`);
  }
  return getStore().writePost(post);
}
