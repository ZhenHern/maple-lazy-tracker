import { revalidateTag } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { ingest } from "@/lib/ingest";
import { POSTS_TAG } from "@/lib/tracker";

// Classifying several posts can take a few minutes when models are busy.
export const maxDuration = 300;

// Local development only. GET /api/dev/ingest?limit=<Gemini requests to spend, default 2>
// One request carries several posts, so a small limit goes a long way.
// Add &images to re-match pictures on unchanged posts (no Gemini calls).
// Add &recheck to run the plain-code grounding checks again on stored posts
// (no Gemini calls): for when a check was added and stored ratings need it.
// The scheduled, secured version is app/api/cron/ingest/route.ts.
export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return new NextResponse(null, { status: 404 });
  }

  const limit = Number(request.nextUrl.searchParams.get("limit") ?? "2");
  if (!Number.isInteger(limit) || limit < 0 || limit > 10) {
    return NextResponse.json({ error: "limit must be a whole number from 0 to 10" }, { status: 400 });
  }

  try {
    const refreshImages = request.nextUrl.searchParams.has("images");
    const recheck = request.nextUrl.searchParams.has("recheck");
    const report = await ingest({ maxRequests: limit, refreshImages, recheck });
    // Tell Next.js the cached list is out of date, so the next visit rebuilds it.
    revalidateTag(POSTS_TAG, "max");
    return NextResponse.json(report);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
