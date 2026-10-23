import { describe, expect, it } from "vitest";
import { laziness, planBar } from "@/lib/day-plan";

const entry = (id: string, minutes: number) => ({ id, title: id, minutes });

describe("planBar", () => {
  it("fills the bar with the quests' minutes, longest first, and leaves the rest free", () => {
    const bar = planBar([entry("short", 5), entry("long", 10)], 30);
    expect(bar.segments.map((segment) => segment.id)).toEqual(["long", "short"]);
    expect(bar.segments[0].share).toBeCloseTo(33.33, 1);
    expect(bar.free).toBeCloseTo(50, 5);
    expect(bar.used).toBe(15);
    expect(bar.spare).toBe(15);
    expect(bar.over).toBe(false);
  });

  it("makes the bar the quests' own total when there is no limit", () => {
    const bar = planBar([entry("a", 10), entry("b", 10)], 0);
    expect(bar.segments.map((segment) => segment.share)).toEqual([50, 50]);
    expect(bar.free).toBe(0);
    expect(bar.spare).toBeNull();
    expect(bar.over).toBe(false);
  });

  it("says the day is over when one-minute claims push past the playtime", () => {
    const bar = planBar([entry("big", 15), entry("claim", 1.2)], 15);
    expect(bar.over).toBe(true);
    expect(bar.used).toBe(16);
    expect(bar.spare).toBe(0);
    expect(bar.free).toBe(0);
    const shares = bar.segments.reduce((sum, segment) => sum + segment.share, 0);
    expect(shares).toBeCloseTo(100, 5);
  });

  it("leaves out quests that cost no playtime", () => {
    const bar = planBar([entry("afk", 0)], 30);
    expect(bar.segments).toEqual([]);
    expect(bar.free).toBe(100);
    expect(bar.used).toBe(0);
    expect(bar.spare).toBe(30);
  });

  it("copes with an empty list and no limit", () => {
    const bar = planBar([], 0);
    expect(bar).toEqual({ segments: [], free: 0, used: 0, spare: null, over: false });
  });
});

describe("laziness", () => {
  it("is null when nothing is running", () => {
    expect(laziness({ must_do: 0, if_free: 0, skip: 0 })).toBeNull();
  });

  it("counts If Free and Skip as the part that can wait", () => {
    expect(laziness({ must_do: 2, if_free: 3, skip: 5 })).toEqual({
      level: 8,
      percent: 80,
      title: "Legendary Slacker",
    });
  });

  it("starts at the bottom of the ladder when everything is a Must Do", () => {
    expect(laziness({ must_do: 6, if_free: 0, skip: 0 })).toEqual({
      level: 0,
      percent: 0,
      title: "Workaholic",
    });
  });

  it("picks the title from the percentage", () => {
    expect(laziness({ must_do: 5, if_free: 0, skip: 5 })?.title).toBe("Part-time Hero");
    expect(laziness({ must_do: 3, if_free: 1, skip: 1 })?.title).toBe("Part-time Hero");
    expect(laziness({ must_do: 4, if_free: 1, skip: 0 })?.title).toBe("Steady Grinder");
  });

  it("stops at level 10", () => {
    expect(laziness({ must_do: 0, if_free: 0, skip: 4 })?.level).toBe(10);
  });
});
