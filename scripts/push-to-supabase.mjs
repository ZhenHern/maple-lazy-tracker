// Copies the posts graded on this machine (.data/) into Supabase, so a new
// database starts with content instead of waiting on the Gemini quota.
//
//   node --env-file=.env.local scripts/push-to-supabase.mjs
//
// Safe to run again: rows are matched on source_id and overwritten. Add
// "--check" to only test the connection and count the rows already there.
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { PostgrestClient } from "@supabase/postgrest-js";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must both be set in .env.local.");
  process.exit(1);
}

const base = url.endsWith("/") ? url.slice(0, -1) : url;
const db = new PostgrestClient(`${base}/rest/v1`, {
  headers: { apikey: key, Authorization: `Bearer ${key}` },
});

function stop(error, action) {
  if (!error) return;
  console.error(`Supabase failed to ${action}: ${error.message}`);
  if (/does not exist|schema cache/i.test(error.message)) {
    console.error("The tables are missing: run supabase/schema.sql in the SQL editor first.");
  }
  process.exit(1);
}

async function readDir(dir) {
  const files = (await readdir(dir).catch(() => [])).filter((file) => file.endsWith(".json"));
  return Promise.all(
    files.map(async (file) => ({
      name: path.basename(file, ".json"),
      value: JSON.parse(await readFile(path.join(dir, file), "utf8")),
    })),
  );
}

const before = await db.from("posts").select("source_id", { count: "exact", head: true });
stop(before.error, "reach the posts table");
console.log(`Connected. Posts in the database: ${before.count}`);
if (process.argv.includes("--check")) process.exit(0);

// The same column mapping as lib/db/supabase-store.ts.
const rows = (await readDir(path.join(".data", "posts"))).map(({ value: post }) => ({
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
  warnings: post.warnings ?? [],
  error: post.error ?? null,
  classified_at: post.classifiedAt,
}));
if (rows.length > 0) {
  const { error } = await db.from("posts").upsert(rows, { onConflict: "source_id" });
  stop(error, "save the posts");
}

// The quota ledger goes too, so the server does not retry models that are
// already used up for today.
const meta = (await readDir(path.join(".data", "meta"))).map(({ name, value }) => ({
  key: name,
  value,
  updated_at: new Date().toISOString(),
}));
if (meta.length > 0) {
  const { error } = await db.from("meta").upsert(meta, { onConflict: "key" });
  stop(error, "save meta");
}

console.log(`Copied ${rows.length} posts and ${meta.length} meta values.`);
