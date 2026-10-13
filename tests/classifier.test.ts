import { describe, expect, it } from "vitest";
import { planBatches } from "@/lib/classifier/batch";
import { findDates, isGroundedDate } from "@/lib/classifier/dates";
import { groundItems } from "@/lib/classifier/grounding";
import { parseReply } from "@/lib/classifier/reply";
import { pickImages } from "@/lib/images";
import { eventPeriod, rulesClassify } from "@/lib/classifier/rules";
import type { ScoredItem, ScrapedPost } from "@/lib/types";

const PUBLISHED = "2026-10-06T17:00:30.000Z";
const TEXT = [
  "## Winter Countdown",
  "Countdown Gifts: October 7, 2026 12:00 AM UTC - November 10 11:59 PM UTC",
  "Winter Gifts: November 11, 2026 (after maintenance) - November 24, 2026 11:59 PM UTC",
  "Log in each day to claim a Magnificent Growth Potion and Sol Erda Fragments.",
  "All rewards expire November 25, 2026 at 2:00 AM UTC.",
].join("\n");

function post(overrides: Partial<ScrapedPost> = {}): ScrapedPost {
  return {
    sourceId: "45393",
    kind: "event",
    title: "[Update Oct 8] Winter Countdown Event!",
    url: "https://example.test/45393",
    publishedAt: PUBLISHED,
    thumbnailUrl: null,
    text: TEXT,
    contentHash: "hash",
    sections: [],
    ...overrides,
  };
}

function item(overrides: Partial<ScoredItem> = {}): ScoredItem {
  return {
    id: "winter-countdown",
    title: "Winter Countdown",
    category: "event",
    summary: "Log in daily.",
    why: "A potion a day for one minute.",
    timeCost: "instant",
    daysPerWeek: 7,
    claimUntil: null,
    value: {
      progression: { casual: 70, endgame: 40, returning: 85 },
      limited: 10,
      cosmetic: 0,
    },
    rewards: ["Magnificent Growth Potion"],
    startsAt: "2026-10-07T00:00:00Z",
    endsAt: "2026-11-24T23:59:00Z",
    timeEstimate: { label: "1 min/day", minutesPerWeek: 7, effort: "low", basis: "calculated" },
    ...overrides,
  };
}

describe("findDates", () => {
  it("reads dates with and without a time or a year", () => {
    const dates = findDates(TEXT, PUBLISHED).map((date) => new Date(date.time).toISOString());
    expect(dates).toContain("2026-10-07T00:00:00.000Z");
    // "November 10 11:59 PM UTC" has no year: it takes the post's.
    expect(dates).toContain("2026-11-10T23:59:00.000Z");
    expect(dates).toContain("2026-11-25T02:00:00.000Z");
  });

  it("rolls a yearless date into next year when it would be long past", () => {
    const [date] = findDates("Ends January 5 11:59 PM UTC", "2026-12-10T00:00:00Z");
    expect(new Date(date.time).toISOString()).toBe("2027-01-05T23:59:00.000Z");
  });

  it("accepts a date the post states and rejects one it does not", () => {
    const dates = findDates(TEXT, PUBLISHED);
    expect(isGroundedDate("2026-11-24T23:59:00Z", dates, PUBLISHED)).toBe(true);
    expect(isGroundedDate("2027-11-24T23:59:00Z", dates, PUBLISHED)).toBe(false);
    expect(isGroundedDate("2026-12-15T23:59:00Z", dates, PUBLISHED)).toBe(false);
  });
});

describe("groundItems", () => {
  it("leaves a faithful item alone", () => {
    const { items, warnings } = groundItems([item()], post());
    expect(warnings).toEqual([]);
    expect(items[0]).toEqual(item());
  });

  it("clears a date the post never mentions", () => {
    const { items, warnings } = groundItems([item({ endsAt: "2027-11-24T23:59:00Z" })], post());
    expect(items[0].endsAt).toBeNull();
    expect(warnings).toHaveLength(1);
  });

  it("removes a reward the post never mentions", () => {
    const { items } = groundItems(
      [item({ rewards: ["Magnificent Growth Potion", "Frozen Dragon Mount"] })],
      post(),
    );
    expect(items[0].rewards).toEqual(["Magnificent Growth Potion"]);
  });

  it("keeps a reward the model reworded slightly", () => {
    const { items } = groundItems([item({ rewards: ["Sol Erda Fragments (selector)"] })], post());
    expect(items[0].rewards).toEqual(["Sol Erda Fragments (selector)"]);
  });

  it("removes an amount the post never states, and keeps one it does", () => {
    const text = TEXT + "\nDay 9: Sol Erda Fragment x30. Day 14: Sol Erda Fragment x30.";
    const { items, warnings } = groundItems(
      // The model added two x30 up to x60: a sum is not a fact from the post.
      [item({ rewards: ["Sol Erda Fragment x60", "Sol Erda Fragment x30", "Magnificent Growth Potion"] })],
      post({ text }),
    );
    expect(items[0].rewards).toEqual(["Sol Erda Fragment", "Sol Erda Fragment x30", "Magnificent Growth Potion"]);
    expect(warnings).toHaveLength(1);
  });

  it("drops a coin shop listed as an event, and exact duplicates", () => {
    const { items } = groundItems(
      [item(), item({ id: "shop", title: "Winter Coin Shop" }), item({ id: "again" })],
      post(),
    );
    expect(items.map((each) => each.id)).toEqual(["winter-countdown"]);
  });

  it("aligns a single event's end time with the period the post states", () => {
    // The model copied the Pacific time (4:59 PM) as if it were UTC.
    const { items } = groundItems([item({ endsAt: "2026-11-24T16:59:00Z" })], post());
    expect(items[0].endsAt).toBe("2026-11-24T23:59:00.000Z");
  });

  it("gives an event with no time estimate an uncertain one", () => {
    const { items } = groundItems([item({ timeEstimate: null })], post());
    expect(items[0].timeEstimate?.basis).toBe("uncertain");
    const system = groundItems([item({ category: "system", timeEstimate: null })], post());
    expect(system.items[0].timeEstimate).toBeNull();
  });

  it("marks an estimate without a duration as uncertain", () => {
    const { items } = groundItems(
      [
        item({
          timeEstimate: {
            label: "1,000 monsters/day",
            minutesPerWeek: 70,
            effort: "low",
            basis: "calculated",
          },
        }),
      ],
      post(),
    );
    expect(items[0].timeEstimate).toEqual({
      label: "1,000 monsters/day",
      minutesPerWeek: null,
      effort: null,
      basis: "uncertain",
    });
  });
});

describe("rules fallback", () => {
  it("reads the widest period the post states", () => {
    expect(eventPeriod(post())).toEqual({
      startsAt: "2026-10-07T00:00:00.000Z",
      endsAt: "2026-11-24T23:59:00.000Z",
    });
  });

  it("converts a period given in another time zone back to UTC", () => {
    const text = "- PDT (UTC -7): Tuesday, August 25 5:00 PM - Tuesday, September 8 4:59 PM";
    expect(eventPeriod({ text, publishedAt: "2026-08-25T17:00:00Z" })).toEqual({
      startsAt: "2026-08-26T00:00:00.000Z",
      endsAt: "2026-09-08T23:59:00.000Z",
    });
  });

  it("builds one unrated item that can never be a must-do", () => {
    const [only, ...rest] = rulesClassify(post());
    expect(rest).toEqual([]);
    expect(only.title).toBe("Winter Countdown Event");
    expect(only.endsAt).toBe("2026-11-24T23:59:00.000Z");
    expect(only.value.progression.casual).toBeLessThan(70);
    expect(only.timeEstimate?.basis).toBe("uncertain");
  });
});

describe("planBatches", () => {
  const sized = (name: string, chars: number) => ({ name, text: "x".repeat(chars) });

  it("packs small posts together and sends a big one alone", () => {
    const batches = planBatches(
      [sized("patch", 200), sized("a", 30), sized("b", 40), sized("c", 50)],
      100,
      6,
    );
    expect(batches.map((batch) => batch.map((job) => job.name))).toEqual([
      ["patch"],
      ["a", "b"],
      ["c"],
    ]);
  });

  it("caps the number of posts per request", () => {
    const jobs = Array.from({ length: 5 }, (_, index) => sized(String(index), 1));
    expect(planBatches(jobs, 100, 2).map((batch) => batch.length)).toEqual([2, 2, 1]);
  });
});

describe("parseReply", () => {
  const second = post({ sourceId: "2", title: "Other" });

  it("keeps the good posts when one post in the batch is bad", () => {
    const raw = JSON.stringify({
      posts: [
        { sourceId: "45393", items: [item()] },
        { sourceId: "2", items: [{ nonsense: true }] },
      ],
    });
    const { classified, rejected } = parseReply(raw, [post(), second]);
    expect([...classified.keys()]).toEqual(["45393"]);
    expect(rejected.get("2")).toMatch(/validation/i);
  });

  it("rejects a post the model left out, and non-JSON replies", () => {
    const raw = JSON.stringify({ posts: [{ sourceId: "45393", items: [item()] }] });
    expect(parseReply(raw, [post(), second]).rejected.has("2")).toBe(true);
    expect(parseReply("sorry, I cannot", [post()]).rejected.has("45393")).toBe(true);
  });

  it("cleans ids and strips numbers from uncertain estimates", () => {
    const raw = JSON.stringify({
      posts: [
        {
          sourceId: "45393",
          items: [
            item({
              id: "Winter Countdown!!",
              timeEstimate: {
                label: "Run length not stated",
                minutesPerWeek: 30,
                effort: "low",
                basis: "uncertain",
              },
            }),
          ],
        },
      ],
    });
    const [only] = parseReply(raw, [post()]).classified.get("45393")!.items;
    expect(only.id).toBe("winter-countdown");
    expect(only.timeEstimate?.minutesPerWeek).toBeNull();
  });
});

describe("pickImages", () => {
  const MB = 1_000_000;
  const sizes = new Map([
    ["icon.png", 2_000],
    ["screenshot.png", 0.3 * MB],
    ["poster.png", 5 * MB],
    ["small.gif", 0.2 * MB],
    ["huge.gif", 80 * MB],
  ]);

  it("leads with a reasonable still, puts GIFs last and drops huge ones", () => {
    expect(pickImages([...sizes.keys()], sizes)).toEqual([
      "screenshot.png",
      "icon.png",
      "poster.png",
      "small.gif",
    ]);
  });
});
