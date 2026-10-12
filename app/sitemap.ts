import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";
import { getArchive } from "@/lib/tracker";

// Next.js turns this file into /sitemap.xml: the list of pages a search engine
// should know about. It is built from the same cached data as the archive.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const posts = await getArchive();
  return [
    { url: `${base}/`, changeFrequency: "daily", priority: 1 },
    { url: `${base}/archive`, changeFrequency: "daily", priority: 0.6 },
    ...posts.map((post) => ({
      url: `${base}/archive/${post.sourceId}`,
      lastModified: post.publishedAt,
      changeFrequency: "weekly" as const,
      priority: 0.4,
    })),
  ];
}
