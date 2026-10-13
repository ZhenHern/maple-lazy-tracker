import { describe, expect, it } from "vitest";
import { groundItems } from "@/lib/classifier/grounding";
import { findSchedules } from "@/lib/classifier/schedule";
import { isSchedule } from "@/lib/tiering";

// The table as the v.271 patch notes write it, shortened.
const TEXT = [
  "## Luxe Sauna",
  "September 8, 2026 - November 10, 2026",
  "Back to Top",
  "## Sunny Sunday",
  "Log in each Sunday to enjoy various perks!",
  "Requirements",
  "- Lv. 101 and above characters.",
  "Sunny Sunday Schedule |",
  "Date (UTC) |",
  "Perks |",
  "October 11, 2026 |",
  "- 30% off Star Force enhancements",
  "- Excludes Superior Equipment.",
  "- 1+1 Star Force upon a successful enhancement at 10-Star or below.",
  "|",
  "October 18, 2026 |",
  "- +250% Monster Park Clear EXP",
  "- Excludes Monster Park Extreme",
  "|",
  "October 25, 2026 |",
  "- 50% off Ability Resets",
  "|",
  "Back to Top",
  "## Night of the Yeti",
  "October 14, 2026 - November 11, 2026",
].join("\n");
const PUBLISHED = "2026-09-08T17:00:00.000Z";

describe("findSchedules", () => {
  it("reads every day of a dated table, with its perks", () => {
    const [schedule, ...others] = findSchedules(TEXT, PUBLISHED);
    expect(others).toEqual([]);
    expect(schedule.title).toBe("Sunny Sunday");
    expect(schedule.intro).toBe("Log in each Sunday to enjoy various perks!");
    expect(schedule.days.map((day) => day.startsAt)).toEqual([
      "2026-10-11T00:00:00.000Z",
      "2026-10-18T00:00:00.000Z",
      "2026-10-25T00:00:00.000Z",
    ]);
    expect(schedule.days[0].endsAt).toBe("2026-10-12T00:00:00.000Z");
    // A note under a perk is attached to it, not listed as a perk.
    expect(schedule.days[0].perks).toEqual([
      "30% off Star Force enhancements (Excludes Superior Equipment)",
      "1+1 Star Force upon a successful enhancement at 10-Star or below.",
    ]);
  });

  it("finds nothing in a post without such a table", () => {
    expect(findSchedules("## Winter Countdown\nOctober 7, 2026 - November 10, 2026", PUBLISHED)).toEqual([]);
  });
});

describe("a schedule in a classified post", () => {
  const post = { text: TEXT, publishedAt: PUBLISHED, kind: "patch" as const };

  it("is added as an item of dated days even when the model returned none", () => {
    const { items } = groundItems([], post);
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe("Sunny Sunday");
    expect(items[0].steps).toHaveLength(3);
    expect(items[0].steps[1]).toMatchObject({
      name: "Sunday, October 18",
      startsAt: "2026-10-18T00:00:00.000Z",
      endsAt: "2026-10-19T00:00:00.000Z",
    });
    expect(items[0].endsAt).toBe("2026-10-26T00:00:00.000Z");
    expect(isSchedule(items[0])).toBe(true);
  });
});

describe("isSchedule", () => {
  it("is false for a quest whose steps last as long as the quest", () => {
    const step = { startsAt: "2026-09-30T00:00:00Z", endsAt: "2026-11-10T23:59:00Z" };
    expect(isSchedule({ steps: [step, step] })).toBe(false);
    expect(isSchedule({ steps: [] })).toBe(false);
  });
});
