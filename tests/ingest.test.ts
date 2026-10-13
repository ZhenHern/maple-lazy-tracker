import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BatchOutcome } from "@/lib/classifier/classify";
import type { PostStore } from "@/lib/db/store";
import type { ScoredItem, ScrapedPost, StoredPost } from "@/lib/types";

// The whole ingest flow, with the outside world replaced by fakes: Nexon's
// feed, the image lookups, the post store and Gemini itself. vi.mock swaps a
// module for a stand-in before the code under test imports it (the same idea
// as @MockBean in a Spring test).

const PRIMARY = "gemini-3.6-flash";
const FALLBACK = "gemini-3.5-flash-lite";

const world = vi.hoisted(() => ({
  feed: [] as ScrapedPost[],
  posts: new Map<string, StoredPost>(),
  meta: new Map<string, unknown>(),
  /** What the fake Gemini does for each tier: answer, or be out of quota. */
  primaryUp: true,
  fallbackUp: true,
  /** Source ids the fake model answers with garbage. */
  broken: new Set<string>(),
  calls: [] as { tier: string; ids: string[] }[],
}));

vi.mock("@/lib/scraper/nexon", () => ({
  listTrackedPosts: async () => world.feed,
  fetchPost: async (id: string) => world.feed.find((post) => post.sourceId === id),
  fetchImageSizes: async () => new Map(),
}));

vi.mock("@/lib/scraper/maplestory-io", () => ({
  latestGmsVersion: async () => null,
  findItemIcon: async () => null,
}));

vi.mock("@/lib/db/store", () => {
  const store: PostStore = {
    name: "file",
    readAllPosts: async () => [...world.posts.values()],
    readPost: async (id) => world.posts.get(id) ?? null,
    writePost: async (post) => void world.posts.set(post.sourceId, post),
    recordError: async (id, message) => {
      const stored = world.posts.get(id);
      if (stored) world.posts.set(id, { ...stored, error: message });
    },
    readMeta: async (key) => world.meta.get(key) ?? null,
    writeMeta: async (key, value) => void world.meta.set(key, value),
  };
  return { getStore: () => store, writePost: store.writePost };
});

function scored(title: string): ScoredItem {
  return {
    id: title.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    title,
    category: "event",
    summary: "Do the thing.",
    why: "",
    timeCost: "short",
    daysPerWeek: 7,
    weeklyTarget: null,
    dailyCap: null,
    killsPerDay: null,
    claimUntil: null,
    steps: [],
    requires: null,
    value: {
      progression: { casual: 60, endgame: 60, returning: 60 },
      limited: 0,
      cosmetic: 0,
    },
    rewards: [],
    startsAt: null,
    endsAt: null,
    timeEstimate: null,
  };
}

vi.mock("@/lib/classifier/classify", () => ({
  classifyBatch: async (
    posts: ScrapedPost[],
    { tier }: { tier: "primary" | "fallback" },
  ): Promise<BatchOutcome> => {
    const up = tier === "primary" ? world.primaryUp : world.fallbackUp;
    const outcome: BatchOutcome = {
      model: null,
      classified: new Map(),
      rejected: new Map(),
      requests: 0,
      failures: [],
    };
    if (!up) return { ...outcome, failures: [`${tier}: out of quota`] };

    world.calls.push({ tier, ids: posts.map((post) => post.sourceId) });
    for (const post of posts) {
      if (world.broken.has(post.sourceId)) {
        outcome.rejected.set(post.sourceId, "Failed validation");
      } else {
        outcome.classified.set(post.sourceId, {
          items: [scored(`${post.title} by ${tier}`)],
          warnings: [],
        });
      }
    }
    return { ...outcome, model: tier === "primary" ? PRIMARY : FALLBACK, requests: 1 };
  },
}));

const { ingest } = await import("@/lib/ingest");

function scraped(id: string, kind: "patch" | "event", text = `text of ${id}`): ScrapedPost {
  return {
    sourceId: id,
    kind,
    title: `Post ${id}`,
    url: `https://example.test/${id}`,
    publishedAt: new Date(Date.now() - Number(id) * 3_600_000).toISOString(),
    thumbnailUrl: null,
    text,
    contentHash: `hash:${text}`,
    sections: [],
  };
}

const statuses = (report: Awaited<ReturnType<typeof ingest>>) =>
  Object.fromEntries(report.results.map((result) => [result.sourceId, result.status]));

beforeEach(() => {
  world.feed = [scraped("1", "event"), scraped("2", "event"), scraped("3", "event")];
  world.posts.clear();
  world.meta.clear();
  world.primaryUp = true;
  world.fallbackUp = true;
  world.broken.clear();
  world.calls = [];
});

describe("ingest", () => {
  it("classifies several new posts with a single request", async () => {
    const report = await ingest({ maxRequests: 3 });
    expect(report.requests).toBe(1);
    expect(world.calls).toEqual([{ tier: "primary", ids: ["1", "2", "3"] }]);
    expect(statuses(report)).toEqual({ "1": "classified", "2": "classified", "3": "classified" });
  });

  it("makes no Gemini call when nothing changed", async () => {
    await ingest({ maxRequests: 3 });
    world.calls = [];
    const second = await ingest({ maxRequests: 3 });
    expect(second.requests).toBe(0);
    expect(world.calls).toEqual([]);
    expect(statuses(second)).toEqual({ "1": "unchanged", "2": "unchanged", "3": "unchanged" });
  });

  it("re-classifies only the post whose text changed", async () => {
    await ingest({ maxRequests: 3 });
    world.calls = [];
    world.feed[1] = scraped("2", "event", "edited text");
    const report = await ingest({ maxRequests: 3 });
    expect(world.calls).toEqual([{ tier: "primary", ids: ["2"] }]);
    expect(statuses(report)["2"]).toBe("classified");
  });

  it("keeps the old data live when the model's answer is broken", async () => {
    await ingest({ maxRequests: 3 });
    const before = world.posts.get("2")!.items;
    world.feed[1] = scraped("2", "event", "edited text");
    world.broken.add("2");

    const report = await ingest({ maxRequests: 3 });
    expect(statuses(report)["2"]).toBe("failed");
    expect(world.posts.get("2")!.items).toEqual(before);
    expect(world.posts.get("2")!.error).toBe("Failed validation");
  });

  it("uses the backup model for new posts when the trusted ones are out", async () => {
    world.primaryUp = false;
    const report = await ingest({ maxRequests: 3 });
    expect(statuses(report)).toEqual({ "1": "provisional", "2": "provisional", "3": "provisional" });
    expect(world.posts.get("1")!.model).toBe(FALLBACK);
  });

  it("upgrades backup results once a trusted model is back, never the reverse", async () => {
    world.primaryUp = false;
    await ingest({ maxRequests: 3 });

    // Still out: the backup model must not be asked to redo its own work.
    world.calls = [];
    const waiting = await ingest({ maxRequests: 3 });
    expect(world.calls).toEqual([]);
    expect(statuses(waiting)["1"]).toBe("deferred");

    world.primaryUp = true;
    const upgraded = await ingest({ maxRequests: 3 });
    expect(statuses(upgraded)["1"]).toBe("classified");
    expect(world.posts.get("1")!.model).toBe(PRIMARY);
  });

  it("does not let the backup model overwrite a trusted result", async () => {
    await ingest({ maxRequests: 3 });
    world.primaryUp = false;
    world.calls = [];
    world.feed[0] = scraped("1", "event", "edited text");

    const report = await ingest({ maxRequests: 3 });
    expect(world.calls).toEqual([]);
    expect(statuses(report)["1"]).toBe("deferred");
    expect(world.posts.get("1")!.model).toBe(PRIMARY);
  });

  it("lists a new event unrated when no model can answer, and rates it later", async () => {
    world.primaryUp = false;
    world.fallbackUp = false;
    world.feed = [scraped("1", "event"), scraped("9", "patch")];

    const report = await ingest({ maxRequests: 3 });
    // Patch notes cannot be split without a model, so they wait.
    expect(statuses(report)).toEqual({ "1": "unrated", "9": "deferred" });
    expect(world.posts.get("1")!.model).toBe("rules");
    expect(world.posts.has("9")).toBe(false);

    world.primaryUp = true;
    const later = await ingest({ maxRequests: 3 });
    expect(statuses(later)).toEqual({ "1": "classified", "9": "classified" });
  });

  it("stops at the request limit and defers the rest", async () => {
    // Too big to share a request, so each post needs its own.
    world.feed = ["1", "2", "3"].map((id) => scraped(id, "patch", id.repeat(100_000)));
    const report = await ingest({ maxRequests: 2 });
    expect(report.requests).toBe(2);
    expect(Object.values(statuses(report)).sort()).toEqual(["classified", "classified", "deferred"]);
  });
});
