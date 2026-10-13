import { describe, expect, it } from "vitest";
import { rewardKind } from "@/lib/reward-kind";

describe("rewardKind", () => {
  it.each([
    ["Mesos compensation", "coin"],
    ["Passive EXP", "arrow"],
    ["3x/4x EXP Coupons", "arrow"],
    ["Legendary Growth Potion", "arrow"],
    ["Sweet Spirit Pet Box", "paw"],
    ["Mount Transfer Certificate", "paw"],
    ["Hallowkitty’s Hat Picker Coupon", "hat"],
    ["Sia Astelle / Erel Light Outfits", "hat"],
    ["Requiem of the Gods Medal", "medal"],
    ["Hasty Hero Title", "medal"],
    ["Astra Secondary Weapon I, II, III", "sword"],
    ["Challenger Equipment Set (up to 22-Star Force)", "sword"],
    ["Genesis boss buff", "spark"],
    ["Decisive Willpower skill", "spark"],
    ["Stat upgrades", "spark"],
    ["Special Arcane Symbol Box", "gem"],
    ["Unique/Legendary Scroll rewards", "scroll"],
    ["Pitched Whispers Coupon", "ticket"],
    ["Luxe Sauna Cafe Furnishing", "chair"],
    ["Chance at 22-Star Enhancement (Lv. 200)", "scroll"],
    ["Event Ring Legendary Potential Scroll", "scroll"],
    ["Hair/Face/Mount Transfer Coupons", "ticket"],
    ["Chance at Random Mimic Box x3", "gift"],
    ["Chance at Hidden Mission", "gift"],
    ["Inspector Boxes", "gift"],
  ])("%s -> %s", (name, sprite) => {
    expect(rewardKind(name).sprite).toBe(sprite);
  });
});
