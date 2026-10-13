import { describe, expect, it } from "vitest";
import { matchRewardImage } from "@/lib/images";

// Cases from the icon tester's report: each wrong picture here was live.
const BASE = "https://g.nexonstatic.com/media/abc/";
const urls = (...files: string[]) => files.map((file) => BASE + file);
const picked = (reward: string, ...files: string[]) =>
  matchRewardImage(reward, urls(...files))?.replace(BASE, "") ?? null;

describe("matchRewardImage", () => {
  it("matches an icon file named after the item", () => {
    expect(picked("Sol Erda Fragment", "icon_sol_erda.png", "icon_sol_erda_fragment.png")).toBe(
      "icon_sol_erda_fragment.png",
    );
    expect(picked("Advanced EXP Voucher", "icon_exp_voucher.png", "icon_advanced_exp_voucher.png")).toBe(
      "icon_advanced_exp_voucher.png",
    );
  });

  it("lets a file add or drop a word for the item's form only", () => {
    expect(picked("Sol Erda Fragment", "sol-erda-fragment-coupon.png")).toBe("sol-erda-fragment-coupon.png");
    expect(picked("Virtual Master Chair", "virtual-master.gif")).toBe("virtual-master.gif");
  });

  it("refuses a relative that is another item", () => {
    // Three different items in the game.
    expect(picked("Sol Erda Fragment", "icon_sol_erda.png")).toBeNull();
    expect(picked("Sol Erda", "sol-erda-energy.png")).toBeNull();
    expect(picked("Medal of Honor", "icon_special_medal_of_honor.png")).toBeNull();
    // One picture of two things is neither.
    expect(picked("Challenger Medals", "challenger-medal-roid.png")).toBeNull();
  });

  it("never uses a screenshot of an event window", () => {
    expect(picked("Sol Erda Fragment", "ui_reward_sol_erda_fragment.png")).toBeNull();
  });

  it("tells enhancement scrolls apart by their star count", () => {
    const file = "icon_karma-star-force-15-star-enhancement.png";
    expect(picked("Karma Star Force 15-Star Enhancement (Lv. 160)", file)).toBe(file);
    expect(picked("Karma Star Force 22-Star Enhancement (Lv. 200)", file)).toBeNull();
  });
});

describe("selector coupons", () => {
  it("are not the item they let you pick", () => {
    expect(
      matchRewardImage("Sol Erda Fragment", [
        "https://g.nexonstatic.com/media/abc/icon_sol-erda_sol-erda-fragment-selector-coupon.png",
      ]),
    ).toBeNull();
  });
});
