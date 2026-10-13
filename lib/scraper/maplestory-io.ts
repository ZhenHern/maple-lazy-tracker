import "server-only";
import { z } from "zod";

// maplestory.io is a community-run database built from the game's own data
// files. It is unofficial and has no uptime guarantee, so every call here
// fails soft: a missing icon is fine, a broken ingest is not.
const API = "https://maplestory.io/api";

const versionSchema = z.array(
  z.object({
    region: z.string(),
    mapleVersionId: z.string(),
    isReady: z.boolean(),
    hasImages: z.boolean(),
  }),
);
const searchSchema = z.array(z.object({ id: z.number(), name: z.string().nullish() }));

export interface FoundItem {
  id: number;
  name: string;
}

async function getJson(url: string): Promise<unknown> {
  const response = await fetch(url, { signal: AbortSignal.timeout(12_000) });
  if (!response.ok) throw new Error(`maplestory.io returned ${response.status}`);
  return response.json();
}

/** The newest GMS data version that has images, or null if the service is down. */
export async function latestGmsVersion(): Promise<string | null> {
  try {
    const versions = versionSchema
      .parse(await getJson(`${API}/wz`))
      .filter((each) => each.region === "GMS" && each.isReady && each.hasImages)
      .map((each) => Number(each.mapleVersionId))
      .filter(Number.isFinite);
    return versions.length > 0 ? String(Math.max(...versions)) : null;
  } catch {
    return null;
  }
}

// Words that say what form an item comes in, not which item it is. The post
// says "Hyper Burninator Coupon" where the game says "Hyper Burninator", and
// "Symbol Selector" where the game says "Symbol Selector Coupon".
// "Selector" and "Box" are not form words: a selector coupon is a different
// item from the thing it lets you pick.
const FORM_WORDS = new Set(["coupon", "voucher", "scroll", "ticket", "item"]);
// Words a post adds to say what kind of thing a reward is ("Sweet Spirit Pet",
// "Hasty Hero Title"). The game's own name often leaves them out, so the
// reward may drop them, but an item may not add them: "Nodestone Chair" is not
// a Nodestone.
const KIND_WORDS = new Set(["pet", "mount", "title", "weapon", "chair"]);

const MAX_SEARCHES = 5;

function words(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[’']/g, "")
    // Dots and percent signs stay inside a word: "1.3x" is not "3x".
    .split(/[^a-z0-9.%]+/)
    .map((word) => word.replace(/^\.+|\.+$/g, ""))
    .filter(Boolean)
    .map((word) => (word.length > 3 && word.endsWith("s") && !word.endsWith("ss") ? word.slice(0, -1) : word));
}

const withoutBrackets = (value: string) => value.replace(/\(.*?\)/g, " ");
/** The numbers written inside brackets: the level, range or duration of an item. */
function bracketNumbers(value: string): Set<string> {
  const inside = (value.match(/\(.*?\)/g) ?? []).join(" ");
  return new Set(inside.match(/\d+/g) ?? []);
}

const tidy =(value: string) => value.replace(/\s+/g, " ").trim();

/**
 * The names to search for, most specific first. A reward line carries more
 * than a name ("Chance at Sol Erda Fragment (x300)", "Symbol Selector Coupon
 * x200/x40", "3 Karma Bright Cubes"), so the wording around it is taken off.
 */
export function searchNames(reward: string): string[] {
  const cleaned = tidy(
    reward
      .replace(/^\s*(a\s+)?chance\s+(at|for|of|to\s+\w+)\s+/i, "")
      .replace(/^\s*up\s+to\s+/i, "")
      // "(per claim)", "(up to 500 per claim)": a bracket about amounts.
      .replace(/\([^)]*\b(per|up\s+to|total)\b[^)]*\)/gi, " ")
      // "per claim", "per day": how often, not what.
      .replace(/\bper\s+\w+.*$/i, " ")
      // Amounts: "x30", "(x30)", "(x230 total)", "x200/x40", "x15-30", "(x3/week)".
      .replace(/\(?\bx\s?\d[\d,]*(-\d[\d,]*)?(\s*\/\s*(?!x\d)[a-z]+|\s+total)?\)?/gi, " ")
      .replace(/(^|\s)\/+(?=\s|$)/g, " ")
      .replace(/\btotal\b/gi, " ")
      .replace(/^\s*\d[\d,]*\s+/, ""),
  );
  const plain = tidy(withoutBrackets(cleaned));

  const names = [cleaned, plain];
  // "3x EXP Coupon" is a name; "3x Karma Cube" is an amount. Try both readings.
  names.push(tidy(plain.replace(/\b\d[\d,]*\s?x\b/gi, " ")));
  // "Arcane/Sacred Symbol Selector" is two items: look for either.
  for (const word of plain.split(" ")) {
    if (!word.includes("/")) continue;
    for (const side of word.split("/")) names.push(tidy(plain.replace(word, side)));
  }
  // The search does not find "Hyper Burninator" when asked for the coupon.
  names.push(
    tidy(
      plain
        .split(" ")
        .filter((word) => {
          const [key = ""] = words(word);
          return !FORM_WORDS.has(key) && !KIND_WORDS.has(key);
        })
        .join(" "),
    ),
  );

  return [...new Set(names)].filter((name) => name.length >= 4).slice(0, MAX_SEARCHES);
}

/**
 * The item that a searched name means, or null. A wrong icon is worse than no
 * icon, so the rule is strict: every word of the name must be in the item's
 * name, and the item may add nothing but a form word ("Coupon"), a bracketed
 * qualifier ("(200 - 269)") or an amount ("x10", "100%"). "New Year's 3x EXP
 * Coupon" and "Nodestone Chair" are different items and are refused. Among the
 * items that pass, the one that adds least wins.
 */
export function pickItem(name: string, items: FoundItem[], reward = name): FoundItem | null {
  const named = new Set(words(name));
  const stated = bracketNumbers(reward);
  const wanted = new Set(
    [...named].filter((word) => !FORM_WORDS.has(word) && !KIND_WORDS.has(word)),
  );
  if (wanted.size === 0) return null;

  let best: { item: FoundItem; added: number } | null = null;
  for (const item of items) {
    const outside = words(withoutBrackets(item.name));
    const all = new Set(words(item.name));
    if (![...wanted].every((word) => all.has(word))) continue;
    // "(Lv. 250)" and "(Lv. 160)" are different scrolls, "(30 min)" and
    // "(15 min)" different coupons: brackets that both carry numbers must agree.
    const theirs = bracketNumbers(item.name);
    if (stated.size > 0 && theirs.size > 0 && ![...stated].some((n) => theirs.has(n))) continue;
    const extra = outside.filter((word) => !named.has(word));
    if (!extra.every((word) => FORM_WORDS.has(word) || /^x\d+$|^\d+%$/.test(word))) continue;

    const added = all.size - wanted.size;
    const better =
      !best ||
      added < best.added ||
      (added === best.added && item.name.length < best.item.name.length);
    if (better) best = { item, added };
  }
  return best?.item ?? null;
}

// One answer per search for the life of the process: the same reward names
// come back in every post, and the service is a volunteer's.
const searches = new Map<string, Promise<FoundItem[]>>();

function search(name: string, version: string): Promise<FoundItem[]> {
  const url = `${API}/GMS/${version}/item?searchFor=${encodeURIComponent(name)}&count=50`;
  let pending = searches.get(url);
  if (!pending) {
    pending = getJson(url).then((json) =>
      searchSchema
        .parse(json)
        .flatMap((item) => (item.name ? [{ id: item.id, name: item.name }] : [])),
    );
    searches.set(url, pending);
    // A failure is not an answer; the next ingest may ask again.
    pending.catch(() => searches.delete(url));
  }
  return pending;
}

async function hasPicture(url: string): Promise<boolean> {
  const response = await fetch(url, { signal: AbortSignal.timeout(12_000) });
  return response.ok && (response.headers.get("content-type") ?? "").startsWith("image/");
}

/** Icon URL for the item a reward line names, or null. See `pickItem` for the rule. */
export async function findItemIcon(reward: string, version: string): Promise<string | null> {
  const names = searchNames(reward);
  for (const name of names) {
    try {
      let found = await search(name, version);
      // The game has several items under one name, and not every one has a
      // picture (cash weapons often do not), so a few are tried.
      for (let attempt = 0; attempt < 3; attempt++) {
        // The fullest name is tried on every answer: a search for the plain name
        // can return the item that also fits the bracketed one ("(Lv. 160)").
        const match = pickItem(names[0], found) ?? pickItem(name, found, names[0]);
        if (!match) break;
        const icon = `${API}/GMS/${version}/item/${match.id}/icon`;
        if (await hasPicture(icon)) return icon;
        found = found.filter((item) => item.id !== match.id);
      }
    } catch {
      return null;
    }
  }
  return null;
}
