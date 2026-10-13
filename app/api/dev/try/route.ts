import { revalidateTag } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { readAllPosts } from "@/lib/db/store";
import { promoteLatestTrial, runTrial } from "@/lib/dev/trial";
import { selectOngoing } from "@/lib/ongoing";
import { POSTS_TAG } from "@/lib/tracker";

// The prompt lab. Local development only.
//
//   GET /api/dev/try                  try the current prompt on the posts behind
//                                     today's quest list; nothing live changes
//   GET /api/dev/try?ids=45330,45393  ...on these posts only
//   GET /api/dev/try?tier=fallback    use the backup model (its own daily quota,
//                                     good for cheap first passes)
//   GET /api/dev/try?model=gemini-3-flash-preview
//                                     try one named model, to compare models
//   GET /api/dev/try?limit=2          spend up to 2 requests (default 1)
//   GET /api/dev/try?promote          save the last trial as the live data
//
// Then open /dev/review to compare the trial with what is live.

export const maxDuration = 300;

export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return new NextResponse(null, { status: 404 });
  }
  const params = request.nextUrl.searchParams;

  try {
    if (params.has("promote")) {
      const promoted = await promoteLatestTrial();
      revalidateTag(POSTS_TAG, "max");
      return NextResponse.json({ promoted, next: "Reload / to see the new ratings." });
    }

    const limit = Number(params.get("limit") ?? "1");
    if (!Number.isInteger(limit) || limit < 1 || limit > 6) {
      return NextResponse.json({ error: "limit must be a whole number from 1 to 6" }, { status: 400 });
    }
    const tier = params.get("tier") === "fallback" ? "fallback" : "primary";

    // Default: every post that contributes a quest to the home page, event
    // notices first because several of them fit in one request.
    let ids = (params.get("ids") ?? "").split(",").map((id) => id.trim()).filter(Boolean);
    if (ids.length === 0) {
      const { contributing } = selectOngoing(await readAllPosts(), Date.now(), false);
      ids = contributing.map((post) => post.sourceId);
    }
    if (ids.some((id) => !/^\d+$/.test(id))) {
      return NextResponse.json({ error: "ids must be numeric post ids" }, { status: 400 });
    }

    const model = params.get("model")?.trim() || undefined;
    if (model && !/^[a-z0-9.-]+$/i.test(model)) {
      return NextResponse.json({ error: "model must be a model id" }, { status: 400 });
    }
    const trial = await runTrial({ ids, tier, maxRequests: limit, model });
    return NextResponse.json({
      trial: trial.id,
      promptVersion: trial.promptVersion,
      tier: trial.tier,
      models: trial.models,
      requests: trial.requests,
      classified: trial.posts.map((post) => `${post.sourceId} (${post.items.length} items)`),
      problems: trial.problems,
      next: "Open /dev/review to compare with the live ratings. /api/dev/try?promote saves this trial as live.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
