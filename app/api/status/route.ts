import { connection, NextResponse } from "next/server";
import { fallbackModels, primaryModels, ratingOf } from "@/lib/classifier/models";
import { PROMPT_VERSION } from "@/lib/classifier/prompt";
import { describeLedger, emptyLedger, ledgerSchema } from "@/lib/classifier/quota";
import { getStore } from "@/lib/db/store";
import { parseRunLog, RUN_LOG_KEY } from "@/lib/run-log";

// GET /api/status
//
// A health check for whoever runs the site: is the daily job working, and how
// much of the data is final? It exposes counts and model names only, never
// keys or post contents. (The Spring cousin is an Actuator /health endpoint.)
export async function GET() {
  // Tells Next.js this answer depends on the moment it is asked, so it is
  // computed per request instead of once at build time.
  await connection();
  try {
    const store = getStore();
    const posts = await store.readAllPosts();
    const ledger = ledgerSchema.safeParse(await store.readMeta("gemini-quota"));
    const lastRun = parseRunLog(await store.readMeta(RUN_LOG_KEY));
    const count = (rating: string) =>
      posts.filter((post) => ratingOf(post.model) === rating).length;

    return NextResponse.json(
      {
        ok: true,
        store: store.name,
        posts: posts.length,
        // "ai" is final; "backup" and "unrated" are waiting for a trusted model.
        ratings: { ai: count("ai"), backup: count("backup"), unrated: count("unrated") },
        // Posts rated under an older prompt are redone on a later run.
        outdatedPrompt: posts.filter((post) => post.promptVersion !== PROMPT_VERSION).length,
        withErrors: posts.filter((post) => post.error !== null).length,
        lastClassifiedAt: posts.map((post) => post.classifiedAt).sort().at(-1) ?? null,
        // The daily job: when it last ran, whether it worked, and what it found.
        // A lastSuccessAt more than a day old means the job has stopped.
        lastRun,
        promptVersion: PROMPT_VERSION,
        quota: describeLedger(
          ledger.success ? ledger.data : emptyLedger(),
          [...primaryModels(), ...fallbackModels()],
          Date.now(),
        ),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 503 });
  }
}
