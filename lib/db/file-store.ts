import "server-only";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { storedPostSchema } from "@/lib/classifier/schema";
import type { StoredPost } from "@/lib/types";
import type { PostStore } from "./store";

// The local store: one JSON file per post under .data/. Used on your own
// machine when no Supabase project is configured. It cannot work on Vercel,
// whose file system is read-only.
const DATA_DIR = path.join(process.cwd(), ".data");
const POSTS_DIR = path.join(DATA_DIR, "posts");
const META_DIR = path.join(DATA_DIR, "meta");

async function readJson(file: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch {
    return null;
  }
}

async function writeJson(file: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

/** Every valid post file in `dir`. Used for the store and for the seed data. */
export async function readPostsFrom(dir: string): Promise<StoredPost[]> {
  let files: string[];
  try {
    files = (await readdir(dir)).filter((file) => file.endsWith(".json"));
  } catch {
    return [];
  }
  const posts = await Promise.all(
    files.map(async (file) => {
      // Files on disk are untrusted input like any other, so they are validated.
      const parsed = storedPostSchema.safeParse(await readJson(path.join(dir, file)));
      return parsed.success ? parsed.data : null;
    }),
  );
  return posts.filter((post) => post !== null);
}

// Ids become file names, so anything but plain characters is refused.
function safeName(value: string): string {
  if (!/^[a-z0-9-]+$/i.test(value)) throw new Error(`Refusing unsafe store key: ${value}`);
  return value;
}

export const fileStore: PostStore = {
  name: "file",

  readAllPosts: () => readPostsFrom(POSTS_DIR),

  async readPost(sourceId) {
    const parsed = storedPostSchema.safeParse(
      await readJson(path.join(POSTS_DIR, `${safeName(sourceId)}.json`)),
    );
    return parsed.success ? parsed.data : null;
  },

  async writePost(post) {
    await writeJson(path.join(POSTS_DIR, `${safeName(post.sourceId)}.json`), post);
  },

  async recordError(sourceId, message) {
    const stored = await this.readPost(sourceId);
    // A post that was never classified has no file to attach the error to.
    if (stored) await this.writePost({ ...stored, error: message });
  },

  readMeta: (key) => readJson(path.join(META_DIR, `${safeName(key)}.json`)),

  async writeMeta(key, value) {
    await writeJson(path.join(META_DIR, `${safeName(key)}.json`), value);
  },
};
