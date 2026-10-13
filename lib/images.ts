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
  if (shorter.length >= 8 && longer.includes(shorter)) return true;
  // Two posts rarely word a title identically: "Winter Countdown Check-in" in
  // the notice is "Winter Countdown Daily Check-in" in the patch notes. When
  // every word of one title appears in the other, they name the same thing.
  const [fewer, more] = [titleWords(a), titleWords(b)].sort((p, q) => p.size - q.size);
  return fewer.size >= 2 && [...fewer].every((word) => more.has(word));
}

/**
 * True when two titles share most of their distinctive words without one
 * containing the other: "Night Troupe: Omega Sector" and "Defend the Omega
 * Sector!" are about the same festival.
 */
export function relatedTitle(a: string, b: string): boolean {
  const [fewer, more] = [titleWords(a), titleWords(b)].sort((p, q) => p.size - q.size);
  const shared = [...fewer].filter((word) => more.has(word)).length;
  return shared >= 2 && shared / fewer.size >= 0.6;
}

// Words that carry no identity: "Winter Countdown Event" is "Winter Countdown".
const TITLE_FILLER = new Set(["the", "a", "an", "of", "and", "event", "events"]);

function titleWords(value: string): Set<string> {
  return new Set(
    value
      .toLowerCase()
      .replace(/[’']/g, "")
      .split(/[^a-z0-9]+/)
      .filter((word) => word && !TITLE_FILLER.has(word)),
  );
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

/** Animated GIFs are the heavy ones: Nexon posts some of 10 to 90 MB. */
export function isAnimated(url: string): boolean {
  return url.toLowerCase().split("?")[0].endsWith(".gif");
}

// A still picture up to this size makes a good preview. Bigger ones are kept
// but rank lower, because the preview is also the small thumbnail in the list.
const PREVIEW_MAX_BYTES = 400_000;
// A GIF above this is left out altogether: it costs too much data and CPU.
const GIF_MAX_BYTES = 6_000_000;

/**
 * Picks the pictures to show for an item. The first one is the preview.
 *
 * Still pictures come first, the largest reasonable file leading: sections
 * often open with a tiny item icon, so file size is a better guide than page
 * order to which picture is the screenshot. Animated GIFs come last, smallest
 * first. A list of quests whose thumbnails are multi-megabyte GIFs makes the
 * whole page stutter, because the browser keeps decoding every frame.
 */
export function pickImages(candidates: string[], sizes: Map<string, number>): string[] {
  const size = (url: string) => sizes.get(url) ?? 0;
  const stills = candidates.filter((url) => !isAnimated(url));
  const light = stills.filter((url) => size(url) <= PREVIEW_MAX_BYTES).sort((a, b) => size(b) - size(a));
  const heavy = stills.filter((url) => size(url) > PREVIEW_MAX_BYTES).sort((a, b) => size(a) - size(b));
  const gifs = candidates
    .filter((url) => isAnimated(url) && size(url) <= GIF_MAX_BYTES)
    .sort((a, b) => size(a) - size(b));
  return [...light, ...heavy, ...gifs].slice(0, MAX_IMAGES_PER_ITEM);
}

// Words that appear in Nexon's icon filenames or reward text but say nothing
// about which item it is.
const NOISE = new Set(["icon", "item", "ui", "reward", "img", "image", "x", "the", "of", "a", "lv", "level"]);

// Words that say what form an item comes in. A file may add one of these to
// the reward's name, or leave one out, and still be the same thing:
// "sol-erda-fragment-coupon" is the Sol Erda Fragment, "virtual-master" is the
// Virtual Master Chair. Any other difference is a different item: "Sol Erda",
// "Sol Erda Fragment" and "Sol Erda Energy" are three things in the game.
const FORM = new Set([
  "coupon",
  "voucher",
  "box",
  "ticket",
  "scroll",
  "chair",
  "mount",
  "pet",
  "title",
  "medal",
  "outfit",
  "skin",
  "set",
]);

function nameTokens(value: string): Set<string> {
  return new Set(
    value
      .toLowerCase()
      // The star count of an enhancement scroll is part of its name:
      // "15-star" and "22-star" must not look alike once numbers are dropped.
      .replace(/(\d+)[-\s]?star\b/g, "$1star")
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
    const file = (url.split("/").pop() ?? "").toLowerCase();
    // "ui_reward_sol_erda.png" is a screenshot of an event window, not an icon.
    if (/^ui[_-]/.test(file)) continue;
    const have = nameTokens(file);
    if (have.size === 0) continue;
    let extras: number;
    if ([...wanted].every((token) => have.has(token))) {
      const added = [...have].filter((token) => !wanted.has(token));
      extras = added.length;
      // A one-word reward ("Mesos") must match exactly, or it would match anything.
      if (extras > (wanted.size === 1 ? 0 : 3)) continue;
      // What the file adds must only say the form: "-energy" or "special-"
      // makes it another item, and "-roid" makes it a picture of two things.
      if (!added.every((token) => FORM.has(token))) continue;
    } else if (
      // The file may drop one word of the reward: "virtual-master.gif" is the
      // "Virtual Master Chair". Counted as slightly worse than an exact match.
      have.size >= 2 &&
      wanted.size - have.size === 1 &&
      [...have].every((token) => wanted.has(token)) &&
      // ...but only a form word: without "fragment" it is a different item.
      [...wanted].filter((token) => !have.has(token)).every((token) => FORM.has(token))
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
