import { describe, expect, it } from "vitest";
import { dailyMinutes, planDay, plannedMinutes } from "@/lib/tiering";
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
    daysPerWeek: 7,
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

/** A quest that is a Must Do only for its cosmetics. */
function cosmeticQuest(id: string, score: number, timeCost: TimeCost): TrackerItem {
  return quest(id, "skip", 5, timeCost, {
    value: {
      progression: { casual: "skip", endgame: "skip", returning: "skip" },
      limited: "skip",
      cosmetic: "must_do",
    },
    scores: { progression: { casual: 5, endgame: 5, returning: 5 }, limited: 0, cosmetic: score },
  });
}

const tiers = (plans: ReturnType<typeof planDay>) =>
  Object.fromEntries([...plans].map(([id, plan]) => [id, plan.tier]));

describe("dailyMinutes", () => {
  it("averages the time over the week", () => {
    expect(dailyMinutes(quest("daily", "must_do", 90, "medium"))).toBe(30);
    // 30 minutes on three days a week is about 13 a day.
    expect(dailyMinutes(quest("thrice", "must_do", 90, "medium", { daysPerWeek: 3 }))).toBeCloseTo(12.9, 1);
    // Ten minutes once a week is next to nothing.
    expect(dailyMinutes(quest("weekly", "must_do", 90, "short", { daysPerWeek: 1 }))).toBeLessThan(2);
  });
});

describe("planDay", () => {
  it("makes a one-minute claim a Must Do, unless its rewards are worthless", () => {
    const items = [
      quest("check-in", "if_free", 50, "instant"),
      quest("junk-claim", "skip", 5, "instant"),
      quest("weekly-run", "if_free", 50, "short", { daysPerWeek: 1 }),
    ];
    const plans = planDay(items, "casual", ["progression"], 15, NOW);
    expect(plans.get("check-in")).toEqual({ tier: "must_do", note: "quick" });
    expect(plans.get("junk-claim")).toEqual({ tier: "skip", note: null });
    // A short run once a week averages under two minutes a day.
    expect(plans.get("weekly-run")).toEqual({ tier: "must_do", note: "quick" });
  });

  it("gives the day to the best quest first, not the cheapest", () => {
    const items = [
      quest("fragments", "must_do", 96, "medium"), // 30 min, the patch's best reward
      quest("chairs", "must_do", 75, "short"),
      quest("minor", "must_do", 72, "short"),
    ];
    // 30 minutes: the best one takes the whole day; the cheap ones wait.
    expect(tiers(planDay(items, "casual", ["progression"], 30, NOW))).toEqual({
      fragments: "must_do",
      chairs: "if_free",
      minor: "if_free",
    });
    // An hour: all three fit.
    expect(Object.values(tiers(planDay(items, "casual", ["progression"], 60, NOW)))).toEqual([
      "must_do",
      "must_do",
      "must_do",
    ]);
  });

  it("skips a quest that does not fit but still takes a smaller one after it", () => {
    const items = [
      quest("big", "must_do", 95, "medium"),
      quest("small", "must_do", 80, "short"),
    ];
    expect(tiers(planDay(items, "casual", ["progression"], 15, NOW))).toEqual({
      big: "if_free",
      small: "must_do",
    });
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

  it("sets aside a quest that has not opened, and spends no time on it", () => {
    const items = [
      quest("opens-later", "must_do", 99, "medium", { startsAt: "2026-10-28T00:00:00Z" }),
      quest("today", "must_do", 80, "short"),
    ];
    const plans = planDay(items, "casual", ["progression"], 15, NOW);
    expect(plans.get("opens-later")).toEqual({ tier: "must_do", note: "soon" });
    expect(plans.get("today")).toEqual({ tier: "must_do", note: null });
    expect(plannedMinutes(items, plans)).toBe(10);
    // Once it opens it competes like any other quest.
    const later = planDay(items, "casual", ["progression"], 15, Date.parse("2026-10-29T00:00:00Z"));
    expect(later.get("opens-later")).toEqual({ tier: "if_free", note: "over" });
  });

  it("with no priority picked, fills the day with progression before cosmetics", () => {
    const items = [cosmeticQuest("outfit", 99, "short"), quest("rank-track", "must_do", 80, "short")];
    // 15 minutes holds one of them: progression wins although the outfit scores higher.
    expect(tiers(planDay(items, "endgame", [], 15, NOW))).toEqual({
      "rank-track": "must_do",
      outfit: "if_free",
    });
    // A player who picked cosmetics gets what they asked for.
    expect(tiers(planDay(items, "endgame", ["cosmetic"], 15, NOW))).toEqual({
      outfit: "must_do",
      "rank-track": "skip",
    });
  });

  it("uses the best of the chosen priorities, like the base tier does", () => {
    const outfit = cosmeticQuest("outfit", 95, "short");
    expect(planDay([outfit], "casual", ["progression"], 30, NOW).get("outfit")?.tier).toBe("skip");
    expect(planDay([outfit], "casual", ["cosmetic"], 30, NOW).get("outfit")?.tier).toBe("must_do");
  });
});
