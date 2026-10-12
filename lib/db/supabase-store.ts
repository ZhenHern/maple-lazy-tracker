import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { storedPostSchema } from "@/lib/classifier/schema";
import type { StoredPost } from "@/lib/types";
import type { PostStore } from "./store";

// The production store: the `posts` and `meta` tables in Supabase (hosted
// Postgres). See supabase/schema.sql for the tables.
//
// The key used here bypasses Row Level Security, so this file must only ever
// run on the server. `import "server-only"` makes the build fail if a Client
// Component tries to import it.

let client: SupabaseClient | undefined;
function db(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must both be set.");
  }
  // No session handling: this is a server talking to its own database, not a
  // user signing in.
  client ??= createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}

// Postgres columns are snake_case; the rest of the app is camelCase. These two
// functions are the only place that knows both.
const rowSchema = z.object({
  source_id: z.string(),
  kind: z.string(),
  title: z.string(),
  url: z.string(),
  published_at: z.string(),
  thumbnail_url: z.string().nullable(),
  content_hash: z.string(),
  items: z.unknown(),
  model: z.string().nullable(),
  prompt_version: z.number().nullable(),
  warnings: z.unknown(),
  error: z.string().nullable(),
  classified_at: z.string().nullable(),
});

function toPost(row: unknown): StoredPost | null {
  const parsed = rowSchema.safeParse(row);
  if (!parsed.success) return null;
  const r = parsed.data;
  // Rows are validated on the way out too: the database is input like any other.
  const post = storedPostSchema.safeParse({
    sourceId: r.source_id,
    kind: r.kind,
    title: r.title,
    url: r.url,
    // Postgres returns "+00:00"; the app compares ISO strings ending in "Z".
    publishedAt: new Date(r.published_at).toISOString(),
    thumbnailUrl: r.thumbnail_url,
    contentHash: r.content_hash,
    items: r.items,
    model: r.model,
    promptVersion: r.prompt_version,
    classifiedAt: r.classified_at ? new Date(r.classified_at).toISOString() : null,
    warnings: r.warnings ?? [],
    error: r.error,
  });
  return post.success ? post.data : null;
}

function toRow(post: StoredPost) {
  return {
    source_id: post.sourceId,
    kind: post.kind,
    title: post.title,
    url: post.url,
    published_at: post.publishedAt,
    thumbnail_url: post.thumbnailUrl,
    content_hash: post.contentHash,
    items: post.items,
    model: post.model,
    prompt_version: post.promptVersion,
    warnings: post.warnings,
    error: post.error,
    classified_at: post.classifiedAt,
  };
}

function check(error: { message: string } | null, action: string): void {
  if (error) throw new Error(`Supabase failed to ${action}: ${error.message}`);
}

export const supabaseStore: PostStore = {
  name: "supabase",

  async readAllPosts() {
    const { data, error } = await db()
      .from("posts")
      .select("*")
      .order("published_at", { ascending: false });
    check(error, "read posts");
    return (data ?? []).map(toPost).filter((post) => post !== null);
  },

  async readPost(sourceId) {
    const { data, error } = await db()
      .from("posts")
      .select("*")
      .eq("source_id", sourceId)
      .maybeSingle();
    check(error, "read a post");
    return data ? toPost(data) : null;
  },

  async writePost(post) {
    // "Upsert" = insert, or update when a row with this source_id exists.
    const { error } = await db().from("posts").upsert(toRow(post), { onConflict: "source_id" });
    check(error, "save a post");
  },

  async recordError(sourceId, message) {
    // Only the error column changes, so the previous good items stay live.
    const { error } = await db().from("posts").update({ error: message }).eq("source_id", sourceId);
    check(error, "record an error");
  },

  async readMeta(key) {
    const { data, error } = await db().from("meta").select("value").eq("key", key).maybeSingle();
    check(error, "read meta");
    return data?.value ?? null;
  },

  async writeMeta(key, value) {
    const { error } = await db()
      .from("meta")
      .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: "key" });
    check(error, "save meta");
  },
};
