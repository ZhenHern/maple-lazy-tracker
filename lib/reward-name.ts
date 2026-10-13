// A reward line carries more than an item's name: "Up to 500 Sol Erda
// Fragments per claim", "Chance at Sol Erda / Sol Erda Fragment Selector
// Coupon (x2)", "3 Karma Bright Cubes". Finding its picture, whether among the
// post's own icons or in an item database, starts with taking the wording
// around the name off. Pure code, used on the server only.

const withoutBrackets = (value: string) => value.replace(/\(.*?\)/g, " ");
const tidy = (value: string) => value.replace(/\s+/g, " ").trim();

export interface RewardName {
  /** The name with any bracket that is part of it: "3x EXP Coupon (30 min)". */
  full: string;
  /** The name without brackets: "3x EXP Coupon". */
  plain: string;
}

/** The item a reward line names, without odds, amounts and rates. */
export function rewardName(reward: string): RewardName {
  const full = tidy(
    reward
      .replace(/^\s*(a\s+)?chance\s+(at|for|of|to\s+\w+)\s+/i, "")
      .replace(/^\s*up\s+to\s+/i, "")
      // "Sol Erda / Sol Erda Fragment" is written "Sol Erda/Sol Erda Fragment" in the game.
      .replace(/\s+\/\s+/g, "/")
      // "(per claim)", "(up to 500 per claim)": a bracket about amounts.
      .replace(/\([^)]*\b(per|up\s+to|total)\b[^)]*\)/gi, " ")
      // "per claim", "per day": how often, not what.
      .replace(/\bper\s+\w+.*$/i, " ")
      // Amounts: "x30", "(x30)", "(x230 total)", "x200/x40", "x15-30", "(x3/week)".
      .replace(/\(?\bx\s?\d[\d,]*(-\d[\d,]*)?(\s*\/\s*(?!x\d)[a-z]+|\s+total)?\)?/gi, " ")
      .replace(/(^|\s)\/+(?=\s|$)/g, " ")
      .replace(/\btotal\b/gi, " ")
      // A leading count: "3 Karma Bright Cubes", "500 Sol Erda Fragments".
      .replace(/^\s*\d[\d,]*\s+/, ""),
  );
  // Half a bracket left over from an earlier clean-up ("Nodestone total)").
  const balanced =
    (full.match(/\(/g) ?? []).length === (full.match(/\)/g) ?? []).length
      ? full
      : tidy(full.replace(/[()]/g, " "));
  return { full: balanced, plain: tidy(withoutBrackets(balanced)) };
}

/** "Sol Erda Fragments" as the game names one of them: "Sol Erda Fragment". */
export function singular(name: string): string {
  return name.replace(/([a-z]{3}[^s])s$/i, "$1");
}
