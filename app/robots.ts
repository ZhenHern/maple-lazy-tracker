import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";

// Next.js turns this file into /robots.txt, the note search engines read to
// learn what they may crawl. The API routes are not pages, so they are excluded.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: "/api/" },
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
