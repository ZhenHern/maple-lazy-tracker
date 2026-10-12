import { NextResponse, type NextRequest } from "next/server";
import { ingest } from "@/lib/ingest";

// Classifying several posts can take a few minutes when models are busy.
export const maxDuration = 300;

// Local development only. GET /api/dev/ingest?limit=<posts to classify, default 2>
// Add &images to re-match pictures on unchanged posts (no Gemini calls).
// Phase 2 turns this into the secured cron endpoint.
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
    return NextResponse.json({ results: await ingest(limit, refreshImages) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
