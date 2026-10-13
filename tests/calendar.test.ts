import { describe, expect, it } from "vitest";
import { buildCalendar } from "@/lib/calendar";
import type { TrackerItem } from "@/lib/types";

function quest(overrides: Partial<TrackerItem>): TrackerItem {
  return {
    id: "45393-winter",
    title: "Winter Countdown",
    category: "event",
    summary: "Log in daily; claim gifts.",
    why: "",
    timeCost: "instant",
    daysPerWeek: 7,
    claimUntil: null,
    steps: [],
    requires: null,
    scores: { progression: { casual: 90, endgame: 50, returning: 90 }, limited: 0, cosmetic: 0 },
    value: {
      progression: { casual: "must_do", endgame: "if_free", returning: "must_do" },
      limited: "skip",
      cosmetic: "skip",
    },
    rewards: ["Growth Potion", "Sol Erda"],
    startsAt: null,
    endsAt: "2026-11-24T23:59:00Z",
    timeEstimate: null,
    images: [],
    rewardImages: [],
    source: {
      sourceId: "45393",
      title: "Winter Countdown Event",
      url: "https://example.test/45393",
      publishedAt: "2026-10-06T17:00:00.000Z",
      rating: "ai",
    },
    ...overrides,
  };
}

const options = {
  name: "Lazy Tracker deadlines",
  siteUrl: "https://example.test",
  now: new Date("2026-10-12T00:00:00Z"),
};

describe("buildCalendar", () => {
  it("writes one entry per quest that has an end date", () => {
    const ics = buildCalendar([quest({}), quest({ id: "permanent", endsAt: null })], options);
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(1);
    expect(ics).toContain("UID:45393-winter@lazy-tracker");
    expect(ics).toContain("DTSTART:20261124T225900Z");
    expect(ics).toContain("DTEND:20261124T235900Z");
    expect(ics).toContain("SUMMARY:Last chance: Winter Countdown");
  });

  it("escapes punctuation and uses CRLF line endings", () => {
    const ics = buildCalendar([quest({})], options);
    // Unfold continuation lines before looking for the text.
    const unfolded = ics.replaceAll("\r\n ", "");
    expect(unfolded).toContain(
      String.raw`DESCRIPTION:Log in daily\; claim gifts.\nRewards: Growth Potion\, Sol Erda`,
    );
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics.split("\r\n").every((line) => line.length <= 75)).toBe(true);
  });

  it("is still a valid calendar when nothing is running", () => {
    expect(buildCalendar([], options)).toContain("BEGIN:VCALENDAR");
  });
});
