import { timingSafeEqual } from "node:crypto";
import { revalidateTag } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { ingest } from "@/lib/ingest";
import { POSTS_TAG } from "@/lib/tracker";

// The scheduled refresh. Vercel Cron calls this URL once a day (see
// vercel.json) and sends "Authorization: Bearer <CRON_SECRET>". The URL is
// public, so without the secret check anyone could spend the Gemini quota.

// Vercel stops a function after this many seconds.
export const maxDuration = 300;

// A Gemini request can take up to two minutes, so no new request is started
// after this point. 170s + 120s stays inside maxDuration.
const WORK_WINDOW = 170_000;
// The most Gemini requests one run may spend. One request carries several posts.
const MAX_REQUESTS = 3;

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  // With no secret configured the route stays closed, rather than open to all.
  if (!secret) return false;
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  // timingSafeEqual takes the same time whether the strings differ at the
  // first character or the last, so response time leaks nothing about the secret.
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const report = await ingest({
      maxRequests: MAX_REQUESTS,
      deadline: Date.now() + WORK_WINDOW,
    });
    // Mark the cached list as stale, so the next visitor gets the new data.
    revalidateTag(POSTS_TAG, "max");
    return NextResponse.json(report);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    // A 500 shows up as a failed run in the Vercel dashboard.
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
