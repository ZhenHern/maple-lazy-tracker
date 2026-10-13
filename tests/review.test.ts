import { describe, expect, it } from "vitest";
import { buildReview } from "@/lib/dev/review";
import type { StoredItem, StoredPost } from "@/lib/types";

const NOW = Date.parse("2026-10-13T00:00:00Z");

function item(title: string, casual: number, overrides: Partial<StoredItem> = {}): StoredItem {
  return {
    id: title.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    title,
    category: "event",
    summary: "Do it.",
    why: "",
    timeCost: "short",
    daysPerWeek: 7,
    claimUntil: null,
    value: {
      progression: { casual, endgame: 10, returning: 10 },
      limited: 0,
      cosmetic: 0,
    },
    rewards: [],
    startsAt: null,
    endsAt: "2026-11-10T23:59:00Z",
    timeEstimate: null,
    images: [],
    rewardImages: [],
    ...overrides,
  };
}

function post(sourceId: string, items: StoredItem[], model = "gemini-3.5-flash-lite"): StoredPost {
  return {
    sourceId,
    kind: "event",
    title: `Post ${sourceId}`,
    url: `https://example.test/${sourceId}`,
    publishedAt: "2026-10-01T00:00:00.000Z",
    thumbnailUrl: null,
    contentHash: "hash",
    items,
    model,
    promptVersion: 8,
    classifiedAt: "2026-10-12T00:00:00.000Z",
    warnings: [],
    error: null,
  };
}

describe("buildReview", () => {
  const live = [post("1", [item("Daily Gift", 95), item("Coin Hunt", 50)])];

  it("shows live ratings only when there is no trial", () => {
    const { rows, differences } = buildReview(live, [], NOW);
    expect(differences).toBe(0);
    expect(rows.map((row) => row.status)).toEqual(["same", "same"]);
    expect(rows.find((row) => row.title === "Daily Gift")?.live?.casual).toEqual({
      tier: "must_do",
      score: 95,
    });
    expect(rows[0].trial).toBeNull();
  });

  it("marks a quest whose tier the trial moves", () => {
    const trial = [post("1", [item("Daily Gift", 40), item("Coin Hunt", 50)], "gemini-3.6-flash")];
    const { rows, differences } = buildReview(live, trial, NOW);
    const gift = rows.find((row) => row.title === "Daily Gift")!;
    expect(gift.status).toBe("changed");
    expect(gift.live?.casual.tier).toBe("must_do");
    expect(gift.trial?.casual).toEqual({ tier: "if_free", score: 40 });
    expect(gift.model).toBe("gemini-3.6-flash");
    expect(differences).toBe(1);
  });

  it("matches quests by title, and reports ones only one side has", () => {
    const trial = [
      post("1", [
        // Same quest under a different slug: still the same row.
        item("Daily Gift", 95, { id: "renamed-slug" }),
        item("Bonus Stage", 60),
      ]),
    ];
    const statuses = Object.fromEntries(
      buildReview(live, trial, NOW).rows.map((row) => [row.title, row.status]),
    );
    expect(statuses).toEqual({ "Daily Gift": "same", "Bonus Stage": "new", "Coin Hunt": "gone" });
  });

  it("leaves posts outside the trial untouched", () => {
    const two = [...live, post("2", [item("Other Event", 30)])];
    const trial = [post("1", [item("Daily Gift", 95), item("Coin Hunt", 50)])];
    const other = buildReview(two, trial, NOW).rows.find((row) => row.title === "Other Event")!;
    expect(other.status).toBe("same");
    expect(other.live).toEqual(other.trial);
  });
});
