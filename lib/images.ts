import type { PostSection, TrackerItem } from "@/lib/types";

const MAX_CANDIDATES_PER_ITEM = 8;
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
function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function findSection(title: string, sections: PostSection[]): PostSection | undefined {
  const wanted = normalize(title);
  if (!wanted) return undefined;
  const headed = sections.filter((section) => section.heading);
  return (
    headed.find((section) => normalize(section.heading) === wanted) ??
    // Looser match for titles Gemini shortened or extended, e.g. with a prefix.
    headed.find((section) => {
      const heading = normalize(section.heading);
      return heading.length >= 6 && (heading.includes(wanted) || wanted.includes(heading));
    })
  );
}

/**
 * The images that sit under an item's heading in the original post, in page
 * order. A post that is a single event (an event notice) lends all its images
 * to its one item.
 */
export function candidateImages(
  item: TrackerItem,
  itemCount: number,
  sections: PostSection[],
): string[] {
  const images =
    findSection(item.title, sections)?.images ??
    (itemCount === 1 ? sections.flatMap((section) => section.images) : []);
  return images.slice(0, MAX_CANDIDATES_PER_ITEM);
}

/**
 * Picks the images to show, biggest file first. Sections often open with a
 * tiny item icon, so file size is a better guide than page order to which
 * picture is the screenshot worth using as the preview.
 */
export function pickImages(candidates: string[], sizes: Map<string, number>): string[] {
  return [...candidates]
    .sort((a, b) => (sizes.get(b) ?? 0) - (sizes.get(a) ?? 0))
    .slice(0, MAX_IMAGES_PER_ITEM);
}
