import { NextResponse, type NextRequest } from "next/server";
import { saveFeedback } from "@/lib/db/feedback-store";
import { feedbackSchema } from "@/lib/feedback";

// POST /api/feedback
//
// Receives the feedback form. The endpoint is public, so it assumes the worst
// of every request: the body is validated, sizes are capped, a hidden field
// catches simple bots, and one address can only send a few messages at a time.

// A serverless function keeps memory only while it stays warm, so this limit
// is best effort: it stops a script hammering one instance, not a determined
// attacker. The table's size caps are the real backstop.
const WINDOW_MS = 10 * 60_000;
const MAX_PER_WINDOW = 5;
const recent = new Map<string, number[]>();

function allowed(address: string, now: number): boolean {
  const times = (recent.get(address) ?? []).filter((time) => now - time < WINDOW_MS);
  if (times.length >= MAX_PER_WINDOW) {
    recent.set(address, times);
    return false;
  }
  recent.set(address, [...times, now]);
  // Keeps the map from growing without bound on a long-lived instance.
  if (recent.size > 5000) recent.clear();
  return true;
}

function sameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  // Browsers always send Origin on a cross-site POST. No header means a
  // same-origin form or a script, which the other checks deal with.
  if (!origin) return true;
  try {
    return new URL(origin).host === request.headers.get("host");
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: "Wrong origin." }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "The message could not be read." }, { status: 400 });
  }

  // The form has a field people cannot see. Only a bot fills it in; it is told
  // "thanks" so it does not try again another way.
  if (typeof body === "object" && body !== null && "website" in body && body.website) {
    return NextResponse.json({ ok: true });
  }

  const parsed = feedbackSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Please write at least a sentence, and keep it under 2,000 characters." },
      { status: 400 },
    );
  }

  const address = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!allowed(address, Date.now())) {
    return NextResponse.json(
      { error: "That is a lot of messages. Please try again in a few minutes." },
      { status: 429 },
    );
  }

  try {
    await saveFeedback({
      ...parsed.data,
      page: (request.headers.get("referer") ?? "").slice(0, 300),
      userAgent: (request.headers.get("user-agent") ?? "").slice(0, 300),
    });
  } catch (error) {
    console.error("[feedback]", error);
    return NextResponse.json(
      { error: "The message could not be saved. Please try again later." },
      { status: 503 },
    );
  }
  return NextResponse.json({ ok: true });
}
