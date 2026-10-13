import { describe, expect, it } from "vitest";
import { isEffect, rewardName, singular } from "@/lib/reward-name";

describe("isEffect", () => {
  it.each([
    "1+1 Star Force (Up to 10*)",
    "30% Star Force Discount",
    "50% off Ability Resets",
    "100% Star Force Safeguard up to 21* (Perk)",
    "2x Sol Erda while hunting (Nov 1)",
    "2x Monster Park EXP",
    "3x Trace of Darkness Drops",
    "Passive EXP Every 5 Seconds",
    "Increased Death Count (Seren/Kalos)",
    "Up to 58% EXP Reduction (210-259)",
    "Sol Erda Energy from Bosses (Perk)",
    "Genesis boss buff",
  ])("%s is an effect", (reward) => {
    expect(isEffect(reward)).toBe(true);
  });

  it.each([
    "3x EXP Coupon (30 min)",
    "Event Ring Exclusive Legendary Potential Scroll 100%",
    "Karma Star Force 22-Star Enhancement (Lv. 200)",
    "Up to 500 Sol Erda Fragments per claim",
    "Weekly Boss Clear Count Reset Ticket",
    "Sol Erda / Sol Erda Fragment Selector Coupon (x2)",
    "Magnificent Growth Potion (200 - 249)",
    "Chance at Karma Legendary Potential Scroll 100%",
    "Transcendent Growth Potion",
    "We Are M-Force Chair",
  ])("%s is an item", (reward) => {
    expect(isEffect(reward)).toBe(false);
  });
});

describe("rewardName", () => {
  it("takes the wording around the name off", () => {
    expect(rewardName("Up to 500 Sol Erda Fragments per claim").plain).toBe("Sol Erda Fragments");
    expect(rewardName("Chance at Sol Erda / Sol Erda Fragment Selector Coupon (x2)").plain).toBe(
      "Sol Erda/Sol Erda Fragment Selector Coupon",
    );
    expect(rewardName("3x EXP Coupon (30 min)")).toEqual({
      full: "3x EXP Coupon (30 min)",
      plain: "3x EXP Coupon",
    });
  });

  it("gives the singular of a plural name", () => {
    expect(singular("Sol Erda Fragments")).toBe("Sol Erda Fragment");
    expect(singular("Karma Bright Cubes")).toBe("Karma Bright Cube");
    // Not a plural.
    expect(singular("Mesos compass")).toBe("Mesos compass");
  });
});
