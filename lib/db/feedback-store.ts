import "server-only";
import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { PostgrestClient } from "@supabase/postgrest-js";
import type { Feedback } from "@/lib/feedback";

// Where feedback messages go: the `feedback` table in Supabase (see
// supabase/schema.sql), read in the dashboard's Table Editor. Without
// Supabase, messages are appended to .data/feedback.jsonl so the form can be
// tried locally.

export interface StoredFeedback extends Feedback {
  /** The page the form was sent from. */
  page: string;
  userAgent: string;
}

const LOCAL_FILE = path.join(process.cwd(), ".data", "feedback.jsonl");

export async function saveFeedback(entry: StoredFeedback): Promise<void> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    await mkdir(path.dirname(LOCAL_FILE), { recursive: true });
    const line = JSON.stringify({ ...entry, createdAt: new Date().toISOString() });
    await appendFile(LOCAL_FILE, `${line}\n`);
    return;
  }

  const base = url.endsWith("/") ? url.slice(0, -1) : url;
  const db = new PostgrestClient(`${base}/rest/v1`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  const { error } = await db.from("feedback").insert({
    kind: entry.kind,
    message: entry.message,
    about: entry.about || null,
    contact: entry.contact || null,
    page: entry.page || null,
    user_agent: entry.userAgent || null,
  });
  if (error) throw new Error(`Supabase failed to save feedback: ${error.message}`);
}
