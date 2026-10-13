import { describe, expect, it } from "vitest";
import { planDay, plannedMinutes } from "@/lib/tiering";
import type { Tier, TimeCost, TrackerItem } from "@/lib/types";

const NOW = Date.parse("2026-10-13T00:00:00Z");

/** A quest whose progression tier and score are the same for every job. */
function quest(
  id: string,
  tier: Tier,
  score: number,
  timeCost: TimeCost,
  overrides: Partial<TrackerItem> = {},
): TrackerItem {
  return {
    id,
    title: id,
    category: "event",
    summary: "Do it.",
    why: "",
    timeCost,
    value: {
      progression: { casual: tier, endgame: tier, returning: tier },
      limited: "skip",
      cosmetic: "skip",
    },
    scores: {
      progression: { casual: score, endgame: score, returning: score },
      limited: 0,
      cosmetic: 0,
    },
    rewards: [],
    startsAt: null,
    endsAt: "2026-11-10T23:59:00Z",
    timeEstimate: { label: "", minutesPerWeek: null, effort: null, basis: "uncertain" },
    images: [],
    rewardImages: [],
    source: {
      sourceId: "1",
      title: "Post",
      url: "https://example.test/1",
      publishedAt: "2026-10-01T00:00:00.000Z",
      rating: "ai",
    },
    ...overrides,
  };
}

const tiers = (plans: ReturnType<typeof planDay>) =>
  Object.fromEntries([...plans].map(([id, plan]) => [id, plan.tier]));

describe("planDay", () => {
  it("makes a one-minute claim a Must Do, unless its rewards are worthless", () => {
    const items = [
      quest("check-in", "if_free", 50, "instant"),
      quest("junk-claim", "skip", 5, "instant"),
    ];
    const plans = planDay(items, "casual", ["progression"], 15, NOW);
    expect(plans.get("check-in")).toEqual({ tier: "must_do", note: "quick" });
    expect(plans.get("junk-claim")).toEqual({ tier: "skip", note: null });
  });

  it("fills the playtime with the best value per minute first", () => {
    const items = [
      quest("big-grind", "must_do", 95, "medium"), // 30 min, 3.2 points a minute
      quest("quick-win", "must_do", 80, "short"), // 10 min, 8 points a minute
      quest("second-win", "must_do", 75, "short"), // 10 min, 7.5 points a minute
    ];
    // 30 minutes: both short ones fit (20), the 30-minute one no longer does.
    expect(tiers(planDay(items, "casual", ["progression"], 30, NOW))).toEqual({
      "quick-win": "must_do",
      "second-win": "must_do",
      "big-grind": "if_free",
    });
    // An hour: everything fits.
    expect(tiers(planDay(items, "casual", ["progression"], 60, NOW))["big-grind"]).toBe("must_do");
  });

  it("drops a quest one tier when it alone is longer than the playtime", () => {
    const items = [
      quest("long-must", "must_do", 90, "long"),
      quest("long-maybe", "if_free", 50, "long"),
    ];
    const plans = planDay(items, "casual", ["progression"], 30, NOW);
    expect(plans.get("long-must")).toEqual({ tier: "if_free", note: "over" });
    expect(plans.get("long-maybe")).toEqual({ tier: "skip", note: "over" });
  });

  it("cuts nothing when there is no time limit", () => {
    const items = [quest("long-must", "must_do", 90, "long"), quest("other", "must_do", 80, "medium")];
    expect(tiers(planDay(items, "casual", ["progression"], 0, NOW))).toEqual({
      "long-must": "must_do",
      other: "must_do",
    });
  });

  it("does not spend time on quests that have not opened or need no play", () => {
    const items = [
      quest("opens-later", "must_do", 90, "medium", { startsAt: "2026-10-28T00:00:00Z" }),
      quest("passive-change", "must_do", 85, "instant", { category: "system", timeEstimate: null }),
      quest("today", "must_do", 80, "short"),
    ];
    const plans = planDay(items, "casual", ["progression"], 15, NOW);
    expect(tiers(plans)).toEqual({
      "opens-later": "must_do",
      "passive-change": "must_do",
      today: "must_do",
    });
    expect(plannedMinutes(items, plans, NOW)).toBe(10);
  });

  it("uses the best of the chosen priorities, like the base tier does", () => {
    const cosmetic = quest("outfit", "skip", 5, "short", {
      value: {
        progression: { casual: "skip", endgame: "skip", returning: "skip" },
        limited: "skip",
        cosmetic: "must_do",
      },
      scores: {
        progression: { casual: 5, endgame: 5, returning: 5 },
        limited: 0,
        cosmetic: 95,
      },
    });
    expect(planDay([cosmetic], "casual", ["progression"], 30, NOW).get("outfit")?.tier).toBe("skip");
    expect(planDay([cosmetic], "casual", ["cosmetic"], 30, NOW).get("outfit")?.tier).toBe("must_do");
  });
});
