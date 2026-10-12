import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import type { PostKind, PostSummary, ScrapedPost } from "@/lib/types";
import { htmlToText } from "./html-to-text";

// The public news site is a client-rendered shell; this is the JSON API it calls.
const NEWS_API = "https://g.nexonstatic.com/maplestory/cms/v1/news";
const NEWS_SITE = "https://www.nexon.com/maplestory/news";

const listItemSchema = z.object({
  id: z.number(),
  name: z.string(),
  category: z.string(),
  liveDate: z.string(),
  // Older posts send null here; newer ones send a boolean or omit the field.
  isMSCW: z.boolean().nullish(),
});
const detailSchema = listItemSchema.extend({ body: z.string() });

type ListItem = z.infer<typeof listItemSchema>;

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, {
    headers: { "User-Agent": "LazyTracker/0.1 (fan project)" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) {
    throw new Error(`Nexon news API returned ${response.status} for ${url}`);
  }
  return response.json();
}

// Decides which posts we track. Classic World (isMSCW) is a separate game mode.
function kindOf(item: ListItem): PostKind | null {
  if (item.isMSCW) return null;
  if (item.category === "update" && /patch notes/i.test(item.name)) return "patch";
  if (item.category === "events") return "event";
  return null;
}

function toSummary(item: ListItem, kind: PostKind): PostSummary {
  return {
    sourceId: String(item.id),
    kind,
    title: item.name,
    url: `${NEWS_SITE}/${item.category}/${item.id}`,
    publishedAt: new Date(item.liveDate).toISOString(),
  };
}

/** Tracked posts (patch notes and event notices), newest first. */
export async function listTrackedPosts(): Promise<PostSummary[]> {
  const rawItems = z.array(z.unknown()).parse(await fetchJson(NEWS_API));
  return rawItems
    .flatMap((raw) => {
      // Validate per item so one malformed post cannot break the whole list.
      const item = listItemSchema.safeParse(raw);
      const kind = item.success ? kindOf(item.data) : null;
      return item.success && kind ? [toSummary(item.data, kind)] : [];
    })
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

export async function fetchPost(sourceId: string): Promise<ScrapedPost> {
  const parsed = detailSchema.safeParse(await fetchJson(`${NEWS_API}/${sourceId}`));
  if (!parsed.success) {
    throw new Error(`Post ${sourceId} has an unexpected shape: ${z.prettifyError(parsed.error)}`);
  }
  const detail = parsed.data;
  const kind = kindOf(detail);
  if (!kind) {
    throw new Error(`Post ${sourceId} is not a patch note or event notice`);
  }
  const text = htmlToText(detail.body);
  return {
    ...toSummary(detail, kind),
    text,
    contentHash: createHash("sha256").update(text).digest("hex"),
  };
}
