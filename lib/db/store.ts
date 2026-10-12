import "server-only";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { storedPostSchema } from "@/lib/classifier/schema";
import type { StoredPost } from "@/lib/types";

// Local stand-in for the Supabase `posts` table: one JSON file per post.
// It cannot work on Vercel, whose file system is read-only, so Phase 2 replaces
// the bodies of these functions with Supabase queries. Callers do not change.
const STORE_DIR = path.join(process.cwd(), ".data", "posts");
// Committed sample data, used when nothing has been ingested on this machine.
const SEED_DIR = path.join(process.cwd(), "data", "seed");

async function readDir(dir: string): Promise<StoredPost[]> {
  let files: string[];
  try {
    files = (await readdir(dir)).filter((file) => file.endsWith(".json"));
  } catch {
    return [];
  }
  const posts = await Promise.all(
    files.map(async (file) => {
      try {
        // Files on disk are untrusted input like any other, so they are validated.
        const parsed = storedPostSchema.safeParse(
          JSON.parse(await readFile(path.join(dir, file), "utf8")),
        );
        return parsed.success ? parsed.data : null;
      } catch {
        return null;
      }
    }),
  );
  return posts.filter((post) => post !== null);
}

/** Every stored post. Falls back to the committed seed data when the store is empty. */
export async function readAllPosts(): Promise<StoredPost[]> {
  const stored = await readDir(STORE_DIR);
  return stored.length > 0 ? stored : readDir(SEED_DIR);
}

export async function readPost(sourceId: string): Promise<StoredPost | null> {
  return (await readDir(STORE_DIR)).find((post) => post.sourceId === sourceId) ?? null;
}

export async function writePost(post: StoredPost): Promise<void> {
  if (!/^\d+$/.test(post.sourceId)) {
    throw new Error(`Refusing to store a post with a non-numeric id: ${post.sourceId}`);
  }
  await mkdir(STORE_DIR, { recursive: true });
  await writeFile(
    path.join(STORE_DIR, `${post.sourceId}.json`),
    `${JSON.stringify(post, null, 2)}\n`,
  );
}
