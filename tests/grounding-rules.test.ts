import { describe, expect, it } from "vitest";
import { groundItems } from "@/lib/classifier/grounding";
import type { ScoredItem } from "@/lib/types";

// The checks added after the fourth Mapler review: each catches a rule the
// prompt states and a model still broke.

const PUBLISHED = "2026-09-29T17:00:00.000Z";
const TEXT = [
  "## Mesotron-S Project",
  "September 30, 2026 - November 10, 2026 11:59 PM UTC",
  "Earn Designer EXP to raise your Designer Rank. Elite rank unlocks the Equipment Transfer.",
  "## Real Gains in Virtual Training",
  "Play the minigame for Designer EXP. Reach 10,000 points for the Virtual Master Chair.",
  "## Hello World, Hello Robot",
  "A random gift each day: Sol Erda Fragment (x300) or a Karma Cube.",
  "Rewards can be claimed until November 17, 2026 11:59 PM UTC.",
  "## Reward list",
  "Symbol Selector Coupon (x60)",
  "Sol Erda Fragment Selector Coupon (x2)",
  "3x EXP Coupon (30 min) and Magnificent Growth Potion (200-249)",
  "Vouchers expire November 20, 2026.",
].join("\n");

const post = { text: TEXT, publishedAt: PUBLISHED, kind: "event" as const };

function item(id: string, overrides: Partial<ScoredItem> = {}): ScoredItem {
  return {
    id,
    title: id,
    category: "event",
    summary: "Do it.",
    why: "",
    timeCost: "short",
    daysPerWeek: 7,
    claimUntil: null,
    steps: [],
    requires: null,
    value: { progression: { casual: 60, endgame: 60, returning: 60 }, limited: 0, cosmetic: 0 },
    rewards: ["Equipment Transfer"],
    startsAt: "2026-09-30T00:00:00Z",
    endsAt: "2026-11-10T23:59:00Z",
    timeEstimate: { label: "10 min a day", minutesPerWeek: 70, effort: "low", basis: "stated" },
    ...overrides,
  };
}

describe("feeder activities", () => {
  const track = item("Mesotron-S Project", {
    summary: "Earn Designer EXP every day to rank up and unlock perks.",
  });
  const minigame = item("Real Gains in Virtual Training", {
    rewards: ["Virtual Master Chair", "Designer EXP"],
    value: { progression: { casual: 30, endgame: 15, returning: 30 }, limited: 40, cosmetic: 55 },
  });

  it("are folded into the track they feed, as steps", () => {
    const draw = item("Hello Robot", { requires: minigame.id, rewards: ["Karma Cube"] });
    const { items, warnings } = groundItems([track, minigame, draw], post);
    expect(items.map((each) => each.id)).toEqual([track.id, draw.id]);
    expect(items[0].steps).toEqual([
      {
        name: "Real Gains in Virtual Training",
        what: "Do it.",
        reward: "Virtual Master Chair",
        startsAt: null,
        endsAt: null,
      },
    ]);
    // The chair makes the track worth something to a collector too.
    expect(items[0].value.cosmetic).toBe(55);
    // A link to the folded item now points at the track.
    expect(items[1].requires).toBe(track.id);
    expect(warnings.some((warning) => warning.includes("folded"))).toBe(true);
  });

  it("stay when no other item runs on what they give", () => {
    const other = item("Go Go Sidekick", { summary: "Clear waves for Fragments." });
    expect(groundItems([other, minigame], post).items).toHaveLength(2);
    // An ordinary EXP reward is not the progress currency of some track.
    const exp = item("Festival Guardian", { rewards: ["Character EXP"] });
    const trainer = item("Training", { summary: "Gain Character EXP faster." });
    expect(groundItems([exp, trainer], post).items).toHaveLength(2);
  });
});

describe("scores", () => {
  it("of an item whose rewards are all draws are capped", () => {
    const { items } = groundItems(
      [
        item("Hello World, Hello Robot", {
          rewards: ["Chance at Sol Erda Fragment (x300)", "Chance at Karma Cube"],
          value: { progression: { casual: 98, endgame: 98, returning: 70 }, limited: 0, cosmetic: 0 },
        }),
      ],
      post,
    );
    expect(items[0].value.progression).toEqual({ casual: 80, endgame: 80, returning: 70 });
  });

  it("are the same for Casual and Endgame when neither gets more from the rewards", () => {
    const { items } = groundItems(
      [
        item("Special Mission", {
          rewards: ["3x EXP Coupon (30 min)", "Magnificent Growth Potion (200-249)"],
          value: { progression: { casual: 50, endgame: 25, returning: 70 }, limited: 0, cosmetic: 0 },
        }),
      ],
      post,
    );
    expect(items[0].value.progression).toEqual({ casual: 50, endgame: 50, returning: 70 });
  });
});

describe("amounts and claim dates", () => {
  it("drops an amount the post writes beside another reward", () => {
    const { items } = groundItems(
      [item("Gifts", { rewards: ["Sol Erda Fragment (x60)", "Symbol Selector Coupon (x60)"] })],
      post,
    );
    expect(items[0].rewards).toEqual(["Sol Erda Fragment", "Symbol Selector Coupon (x60)"]);
  });

  it("keeps a claim deadline the post states, and drops an expiry date posing as one", () => {
    const stated = groundItems([item("Robot", { claimUntil: "2026-11-17T23:59:00Z" })], post);
    expect(stated.items[0].claimUntil).toBe("2026-11-17T23:59:00Z");
    const expiry = groundItems([item("Robot", { claimUntil: "2026-11-20T00:00:00Z" })], post);
    expect(expiry.items[0].claimUntil).toBeNull();
  });
});
