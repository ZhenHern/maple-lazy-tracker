import type { PostSection } from "@/lib/types";

const MAX_IMAGES_PER_ITEM = 5;

/**
 * Nexon's images are shown only when NEXON_IMAGES=1. They are Nexon's
 * copyrighted material and no fan-site licence was found, so this stays off
 * unless the site owner turns it on.
 */
export function nexonImagesEnabled(): boolean {
  return process.env.NEXON_IMAGES === "1";
}

// "Jenny’s Meet and Greet" and "jenny's meet and greet!" should compare equal.
export function normalizeTitle(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

/** True when two titles name the same thing, allowing a prefix or suffix on one. */
export function sameTitle(a: string, b: string): boolean {
  const [x, y] = [normalizeTitle(a), normalizeTitle(b)];
  if (!x || !y) return false;
  if (x === y) return true;
  const shorter = x.length < y.length ? x : y;
  const longer = x.length < y.length ? y : x;
  return shorter.length >= 8 && longer.includes(shorter);
}

/**
 * The images under an item's heading in the original post, in page order.
 * A post that is a single event (an event notice) lends all its images to its
 * one item.
 */
export function sectionImages(
  title: string,
  itemCount: number,
  sections: PostSection[],
): string[] {
  const headed = sections.filter((section) => section.heading);
  const section =
    headed.find((each) => normalizeTitle(each.heading) === normalizeTitle(title)) ??
    headed.find((each) => sameTitle(each.heading, title));
  if (section) return section.images;
  return itemCount === 1 ? sections.flatMap((each) => each.images) : [];
}

/**
 * Picks the pictures to show for an item, biggest file first. Sections often
 * open with a tiny item icon, so file size is a better guide than page order
 * to which picture is the screenshot worth using as the preview.
 */
export function pickImages(candidates: string[], sizes: Map<string, number>): string[] {
  return [...candidates]
    .sort((a, b) => (sizes.get(b) ?? 0) - (sizes.get(a) ?? 0))
    .slice(0, MAX_IMAGES_PER_ITEM);
}

// Words that appear in Nexon's icon filenames or reward text but say nothing
// about which item it is.
const NOISE = new Set(["icon", "item", "ui", "reward", "img", "image", "x", "the", "of", "a"]);

function nameTokens(value: string): Set<string> {
  return new Set(
    value
      .toLowerCase()
      .replace(/\.[a-z0-9]+$/, "")
      .split(/[^a-z0-9]+/)
      .filter((token) => token && !/^\d+$/.test(token) && !NOISE.has(token))
      // "Coupons" and "coupon" should match.
      .map((token) => (token.length > 3 && token.endsWith("s") ? token.slice(0, -1) : token)),
  );
}

/**
 * Finds the icon for a reward among a post's images by filename. Nexon names
 * its icons after the item ("icon_advanced_exp_voucher.png"), so the match
 * requires every word of the reward to appear in the filename (or the filename
 * to be the reward minus one word), and prefers the closest match.
 */
export function matchRewardImage(reward: string, urls: string[]): string | null {
  const wanted = nameTokens(reward);
  if (wanted.size === 0) return null;

  let best: string | null = null;
  let fewestExtras = Infinity;
  for (const url of urls) {
    const have = nameTokens(url.split("/").pop() ?? "");
    if (have.size === 0) continue;
    let extras: number;
    if ([...wanted].every((token) => have.has(token))) {
      extras = have.size - wanted.size;
      // A one-word reward ("Mesos") must match exactly, or it would match anything.
      if (extras > (wanted.size === 1 ? 0 : 3)) continue;
    } else if (
      // The file may drop one word of the reward: "virtual-master.gif" is the
      // "Virtual Master Chair". Counted as slightly worse than an exact match.
      have.size >= 2 &&
      wanted.size - have.size === 1 &&
      [...have].every((token) => wanted.has(token))
    ) {
      extras = 0.5;
    } else {
      continue;
    }
    if (extras < fewestExtras) {
      best = url;
      fewestExtras = extras;
    }
  }
  return best;
}
