import { type NextRequest } from "next/server";
import { buildCalendar } from "@/lib/calendar";
import { PRIORITIES, PROFILES } from "@/lib/classifier/schema";
import { siteUrl, SITE_NAME } from "@/lib/site";
import { resolveTier } from "@/lib/tiering";
import { getOngoing } from "@/lib/tracker";
import type { Priority, Profile, Tier } from "@/lib/types";

// GET /api/calendar?profile=casual&priorities=progression,limited&tier=must_do
//
// Returns the end dates of ongoing quests as a calendar file. A calendar app
// can import it once, or subscribe to this URL and stay up to date. The job
// and priorities live in the visitor's browser, so the page passes them in the
// query string; nothing personal is involved.

const TIERS_BY_DEPTH: Record<string, Tier[]> = {
  // "Worth doing" is the default: Must Do plus If Free.
  must_do: ["must_do"],
  worth: ["must_do", "if_free"],
  all: ["must_do", "if_free", "skip"],
};

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  // Anything unexpected falls back to a default instead of an error: a
  // calendar app polling this URL cannot show the user an error message.
  const profile: Profile = PROFILES.find((each) => each === params.get("profile")) ?? "casual";
  const wanted = (params.get("priorities") ?? "").split(",");
  const priorities: Priority[] = PRIORITIES.filter((each) => wanted.includes(each));
  // Object.hasOwn, not a bare lookup: "?tier=constructor" would otherwise find
  // a property every object inherits and crash the route.
  const depth = params.get("tier") ?? "worth";
  const tiers = Object.hasOwn(TIERS_BY_DEPTH, depth) ? TIERS_BY_DEPTH[depth] : TIERS_BY_DEPTH.worth;

  const { items } = await getOngoing();
  const chosen = items.filter((item) => tiers.includes(resolveTier(item, profile, priorities)));

  const body = buildCalendar(chosen, {
    name: `${SITE_NAME} deadlines`,
    siteUrl: siteUrl(),
    now: new Date(),
  });
  return new Response(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="lazy-tracker.ics"',
      // Calendar apps poll subscriptions; an hour matches how fresh the data is.
      "Cache-Control": "public, max-age=3600",
    },
  });
}
