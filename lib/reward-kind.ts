import type { SpriteName } from "@/components/pixel-sprite";

export interface RewardKind {
  /** The pixel icon that stands in for the missing picture. */
  sprite: SpriteName;
  /** What the icon means, shown as a tooltip. */
  label: string;
}

// Checked from top to bottom, first match wins, so the specific kinds come
// before the general ones: "Sweet Spirit Pet Box" is a pet, not a box, and
// "3x EXP Coupon" is EXP, not a coupon.
const KINDS: [RegExp, RewardKind][] = [
  [/\b(chairs?|furnishings?|furniture)\b/, { sprite: "chair", label: "Chair or furniture" }],
  [/\b(pets?|mounts?|android)\b/, { sprite: "paw", label: "Pet or mount" }],
  [/\b(medals?|titles?|badges?|emblems?|crests?)\b/, { sprite: "medal", label: "Medal or title" }],
  [
    /\b(outfits?|hats?|hair|face|capes?|skins?|cash|cosmetics?|costumes?|royal)\b/,
    { sprite: "hat", label: "Cosmetic" },
  ],
  [
    /\b(weapons?|equipment|equips?|pendants?|accessor(y|ies)|rings?|totems?|armor|secondary)\b/,
    { sprite: "sword", label: "Equipment" },
  ],
  [/\b(buffs?|skills?|blessing)\b/, { sprite: "spark", label: "Buff or skill" }],
  [/\b(exp|experience|growth|level)\b/, { sprite: "arrow", label: "EXP" }],
  [/\b(mesos?|coins?|points?|tokens?)\b/, { sprite: "coin", label: "Currency" }],
  [
    /\b(symbols?|cubes?|cubing|erda|cores?|fragments?|flames?|nodestones?)\b/,
    { sprite: "gem", label: "Upgrade material" },
  ],
  [/\b(scrolls?|star force)\b/, { sprite: "scroll", label: "Scroll or enhancement" }],
  [/\b(potions?|elixirs?)\b/, { sprite: "potion", label: "Potion" }],
  [
    /\b(coupons?|tickets?|vouchers?|pass(es)?|certificates?|transfer|cards?)\b/,
    { sprite: "ticket", label: "Coupon or ticket" },
  ],
  [
    /\b(multipliers?|bonus(es)?|stats?|discount|chance|\dx)\b/,
    { sprite: "spark", label: "Buff or skill" },
  ],
];

const OTHER: RewardKind = { sprite: "gift", label: "Reward" };

/**
 * Guesses what kind of thing a reward is from its name, for rewards the patch
 * notes show no picture of. A keyword guess, not a fact: it only picks an icon.
 */
export function rewardKind(name: string): RewardKind {
  const text = name.toLowerCase();
  return KINDS.find(([pattern]) => pattern.test(text))?.[1] ?? OTHER;
}
