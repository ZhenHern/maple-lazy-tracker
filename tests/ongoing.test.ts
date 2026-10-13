import { describe, expect, it } from "vitest";
import { buildOngoing } from "@/lib/ongoing";
import { planDay } from "@/lib/tiering";
import type { StoredItem, StoredPost } from "@/lib/types";

const NOW = Date.parse("2026-10-13T00:00:00Z");

function item(title: string, overrides: Partial<StoredItem> = {}): StoredItem {
  return {
    id: title.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    title,
    category: "event",
    summary: "Do it.",
    why: "",
    timeCost: "short",
    daysPerWeek: 7,
    value: { progression: { casual: 80, endgame: 80, returning: 80 }, limited: 0, cosmetic: 0 },
    rewards: [],
    startsAt: null,
    endsAt: "2026-11-10T23:59:00Z",
    timeEstimate: null,
    images: [],
    rewardImages: [],
    ...overrides,
  };
}

function post(sourceId: string, kind: "patch" | "event", items: StoredItem[]): StoredPost {
  return {
    sourceId,
    kind,
    title: `Post ${sourceId}`,
    url: `https://example.test/${sourceId}`,
    publishedAt: kind === "patch" ? "2026-09-08T00:00:00.000Z" : "2026-09-29T00:00:00.000Z",
    thumbnailUrl: null,
    contentHash: "hash",
    items,
    model: "gemini-3.6-flash",
    promptVersion: 10,
    classifiedAt: "2026-10-12T00:00:00.000Z",
    warnings: [],
    error: null,
  };
}

const titles = (list: { title: string }[]) => list.map((each) => each.title);

describe("buildOngoing", () => {
  it("gives tiers only to dated activities; the rest is news", () => {
    const { items, news } = buildOngoing(
      [
        post("1", "patch", [
          item("Coin Hunt"),
          item("Star Force Revamp", { category: "system", endsAt: null }),
          item("New Boss", { category: "content", endsAt: null }),
          item("Paid Pass", { category: "system" }),
          item("Old Event", { endsAt: "2026-10-01T00:00:00Z" }),
        ]),
      ],
      NOW,
      false,
    );
    expect(titles(items)).toEqual(["Coin Hunt"]);
    expect(titles(news)).toEqual(["Star Force Revamp", "New Boss", "Paid Pass"]);
  });

  it("shows a quest once when the notice and the patch notes word it differently", () => {
    const { items } = buildOngoing(
      [
        post("10", "event", [item("Winter Countdown")]),
        // Same event, longer title, and dated by its claim window instead.
        post("1", "patch", [item("Winter Countdown Daily Check-in", { endsAt: "2026-11-24T23:59:00Z" })]),
      ],
      NOW,
      false,
    );
    expect(items.map((each) => each.source.sourceId)).toEqual(["10"]);
  });

  it("shows a quest once when two posts give it different names but the same rewards", () => {
    const { items } = buildOngoing(
      [
        post("10", "event", [
          item("Mesotron-S Project", {
            rewards: ["Equipment Transfer (Once)", "Hair/Face/Mount Transfer Coupons", "Weekly Boss Reset Ticket"],
          }),
        ]),
        post("1", "patch", [
          item("Night Troupe: Omega Sector", {
            rewards: ["Equipment Transfer (1/world)", "Hair/Face/Mount Transfers", "Transcendent Growth Potion"],
          }),
          item("Unrelated Hunt", { rewards: ["EXP Coupon", "Sol Erda Fragment", "Growth Potion"] }),
        ]),
      ],
      NOW,
      false,
    );
    expect(titles(items)).toEqual(["Mesotron-S Project", "Unrelated Hunt"]);
  });

  it("drops a patch entry named after a festival whose own notice is live", () => {
    const notice = { ...post("10", "event", [item("Mesotron-S Project"), item("Go Go Sidekick!")]), title: "Defend the Omega Sector!" };
    const { items } = buildOngoing(
      [notice, post("1", "patch", [item("Night Troupe: Omega Sector"), item("Unrelated Hunt")])],
      NOW,
      false,
    );
    expect(titles(items)).toEqual(["Mesotron-S Project", "Go Go Sidekick!", "Unrelated Hunt"]);
  });

  it("keeps two activities of one post even when their titles overlap", () => {
    const { items } = buildOngoing(
      [post("10", "event", [item("Operation: Dive"), item("Operation: Dive Dungeon")])],
      NOW,
      false,
    );
    expect(items).toHaveLength(2);
  });
});

describe("idle quests", () => {
  it("are neither promoted as quick claims nor cut for time", () => {
    const { items } = buildOngoing(
      [
        post("10", "event", [
          item("AFK Sauna", {
            timeCost: "idle",
            value: { progression: { casual: 50, endgame: 50, returning: 50 }, limited: 0, cosmetic: 0 },
          }),
        ]),
      ],
      NOW,
      false,
    );
    expect(planDay(items, "casual", [], 15, NOW).get(items[0].id)).toEqual({
      tier: "if_free",
      note: null,
    });
  });
});
