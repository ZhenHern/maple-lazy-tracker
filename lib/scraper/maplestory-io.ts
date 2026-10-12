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

// "Sol Erda Fragment x50" and "3 Karma Bright Cubes" should search by item name.
function searchNames(reward: string): string[] {
  const name = reward
    .replace(/\(.*?\)/g, " ")
    .replace(/\bx\s?\d[\d,]*\b|\b\d[\d,]*\s?x\b/gi, " ")
    .replace(/^\s*\d[\d,]*\s+/, "")
    .replace(/\s+/g, " ")
    .trim();
  if (name.length < 4) return [];
  return name.endsWith("s") ? [name, name.slice(0, -1)] : [name];
}

/**
 * Icon URL for an item whose name matches the reward exactly, or null.
 * Exact matching is deliberate: a wrong icon is worse than no icon.
 */
export async function findItemIcon(reward: string, version: string): Promise<string | null> {
  for (const name of searchNames(reward)) {
    try {
      const url = `${API}/GMS/${version}/item?searchFor=${encodeURIComponent(name)}&count=10`;
      const match = searchSchema
        .parse(await getJson(url))
        .find((item) => item.name?.toLowerCase() === name.toLowerCase());
      if (match) return `${API}/GMS/${version}/item/${match.id}/icon`;
    } catch {
      return null;
    }
  }
  return null;
}
