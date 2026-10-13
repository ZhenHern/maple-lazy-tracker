import { describe, expect, it } from "vitest";
import { pickItem, searchNames, type FoundItem } from "@/lib/scraper/maplestory-io";

const items = (...names: string[]): FoundItem[] => names.map((name, index) => ({ id: index + 1, name }));
const picked = (name: string, ...names: string[]) => pickItem(name, items(...names))?.name ?? null;

describe("searchNames", () => {
  it("takes the wording around an item's name off", () => {
    expect(searchNames("Chance at Sol Erda Fragment (x300)")[0]).toBe("Sol Erda Fragment");
    expect(searchNames("Sol Erda Fragment (x30) per claim")[0]).toBe("Sol Erda Fragment");
    expect(searchNames("Symbol Selector Coupon x200/x40")[0]).toBe("Symbol Selector Coupon");
    expect(searchNames("Nodestone (x230 total)")[0]).toBe("Nodestone");
    expect(searchNames("Sol Erda Fragment x500 (per claim)")[0]).toBe("Sol Erda Fragment");
    expect(searchNames("Advanced EXP Voucher (up to 4,000 per claim)")[0]).toBe("Advanced EXP Voucher");
    expect(searchNames("Pitched Whispers Coupon (x3/week)")[0]).toBe("Pitched Whispers Coupon");
    expect(searchNames("x15-30 Sacred Symbols per daily")[0]).toBe("Sacred Symbols");
    expect(searchNames("3 Karma Bright Cubes")[0]).toBe("Karma Bright Cubes");
  });

  it("keeps a bracket that is part of the name, then tries without it", () => {
    expect(searchNames("3x EXP Coupon (30 min)").slice(0, 2)).toEqual([
      "3x EXP Coupon (30 min)",
      "3x EXP Coupon",
    ]);
  });

  it("reads a leading multiplier as a name first and as an amount second", () => {
    expect(searchNames("3x Karma Cube")).toEqual(["3x Karma Cube", "Karma Cube"]);
  });

  it("looks for either side of a slash", () => {
    const names = searchNames("Arcane/Sacred Symbol Selector");
    expect(names).toContain("Arcane Symbol Selector");
    expect(names).toContain("Sacred Symbol Selector");
  });

  it("also searches without the word for the item's form or kind", () => {
    expect(searchNames("Hyper Burninator Coupon")).toContain("Hyper Burninator");
    expect(searchNames("Sweet Spirit Pet (30 Day)")).toContain("Sweet Spirit");
  });

  it("has nothing to search for when no name is left", () => {
    expect(searchNames("x30")).toEqual([]);
  });
});

describe("pickItem", () => {
  it("prefers the exact name", () => {
    expect(picked("Sol Erda Fragment", "Sol Erda Fragment x10 Coupon", "Sol Erda Fragment")).toBe(
      "Sol Erda Fragment",
    );
  });

  it("accepts a qualifier in brackets, a form word or an amount", () => {
    expect(picked("Transcendent Growth Potion", "Transcendent Growth Potion (200 - 269)")).toBe(
      "Transcendent Growth Potion (200 - 269)",
    );
    expect(picked("Symbol Selector", "Arcane Symbol Selector Coupon", "Symbol Selector Coupon")).toBe(
      "Symbol Selector Coupon",
    );
    expect(picked("Hyper Burninator Coupon", "Hyper Burninator")).toBe("Hyper Burninator");
    expect(picked("17-Star Enhancement Scroll", "100% 17-Star Enhancement (Lv. 160)")).toBe(
      "100% 17-Star Enhancement (Lv. 160)",
    );
  });

  it("refuses an item that is something else", () => {
    expect(picked("3x EXP Coupon", "New Year's 3x EXP Coupon", "1.3x EXP Coupon", "4x EXP Coupon")).toBeNull();
    expect(picked("Nodestone", "Nodestone Chair", "Experience Nodestone")).toBeNull();
    expect(picked("Sweet Spirit Pet", "Sweet Spirit (30 Days) Box")).toBeNull();
    expect(picked("17-Star Enhancement", "Karma Star Force 17-Star Enhancement")).toBeNull();
  });

  it("lets the reward drop a kind word the game leaves out, but not add one", () => {
    expect(picked("Sweet Spirit Pet", "Sweet Spirit")).toBe("Sweet Spirit");
    expect(picked("Hasty Hero Title", "Hasty Hero Title Coupon")).toBe("Hasty Hero Title Coupon");
  });

  it("holds to what the reward's own bracket says", () => {
    expect(
      picked("17-Star Enhancement (Lv 160)", "100% 17-Star Enhancement (Lv. 150)", "100% 17-Star Enhancement (Lv. 160)"),
    ).toBe("100% 17-Star Enhancement (Lv. 160)");
    expect(picked("4x EXP Coupon (30 min)", "4x EXP Coupon (15 min)")).toBeNull();
  });
});
