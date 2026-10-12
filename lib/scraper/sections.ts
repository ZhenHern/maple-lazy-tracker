import * as cheerio from "cheerio";
import type { PostSection } from "@/lib/types";

const IMAGE_HOST = "https://g.nexonstatic.com";

/** Makes a CMS image path absolute; returns null for anything not on Nexon's CDN. */
export function toImageUrl(src: string | null | undefined): string | null {
  if (!src) return null;
  if (src.startsWith("/media/")) return `${IMAGE_HOST}${src}`;
  return src.startsWith(`${IMAGE_HOST}/`) ? src : null;
}

/**
 * Splits a post into its headed sections, keeping the images under each one.
 * Images before the first heading (the post banner) land in a section with an
 * empty heading.
 */
export function extractSections(html: string): PostSection[] {
  const $ = cheerio.load(html);
  const sections: PostSection[] = [{ heading: "", images: [] }];

  $("h1, h2, img").each((_, element) => {
    if (element.tagName === "img") {
      const url = toImageUrl($(element).attr("src"));
      const current = sections[sections.length - 1];
      if (url && !current.images.includes(url)) current.images.push(url);
      return;
    }
    const heading = $(element).text().replace(/\s+/g, " ").trim();
    if (heading) sections.push({ heading, images: [] });
  });

  return sections.filter((section) => section.images.length > 0);
}
