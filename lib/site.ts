// The public address of the site, needed wherever a full URL must be written
// out: the sitemap, share previews and calendar entries.

export const SITE_NAME = "Lazy Tracker";
export const SITE_DESCRIPTION =
  "What is actually worth doing in Global MapleStory right now, sorted for your kind of player.";

/** The localStorage key of the day / night choice. Read by a script before React starts. */
export const THEME_KEY = "lazy-tracker:theme";

/**
 * SITE_URL when set; otherwise the production address Vercel provides on its
 * own; otherwise the local dev server. Never ends with a slash.
 */
export function siteUrl(): string {
  const explicit = process.env.SITE_URL;
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  const url = explicit || (vercel ? `https://${vercel}` : "http://localhost:3000");
  return url.endsWith("/") ? url.slice(0, -1) : url;
}
