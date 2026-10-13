import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { StoredPost } from "@/lib/types";

// Runs the Supabase store against a small stand-in for Supabase's REST API
// (PostgREST), started inside the test. It checks the requests supabase-js
// really sends and our snake_case <-> camelCase mapping. It is NOT a real
// Supabase project: constraints, RLS and SQL types are not exercised here.

const KEY = "test-service-role-key";
type Row = Record<string, unknown>;
const tables: Record<string, { key: string; rows: Row[] }> = {
  posts: { key: "source_id", rows: [] },
  meta: { key: "key", rows: [] },
};
const seen: string[] = [];

function readBody(request: import("node:http").IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let body = "";
    request.on("data", (chunk) => (body += chunk));
    request.on("end", () => resolve(body));
  });
}

let server: Server;

beforeAll(async () => {
  server = createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    const table = tables[url.pathname.replace("/rest/v1/", "")];
    seen.push(`${request.method} ${url.pathname}${url.search}`);
    const send = (status: number, body?: unknown) => {
      response.writeHead(status, { "Content-Type": "application/json" });
      response.end(body === undefined ? "" : JSON.stringify(body));
    };

    if (request.headers.authorization !== `Bearer ${KEY}`) return send(401, { message: "bad key" });
    if (!table) return send(404, { message: "no such table" });

    // PostgREST filters look like ?source_id=eq.45393
    const filter = url.searchParams.get(table.key);
    const wanted = filter?.startsWith("eq.") ? filter.slice(3) : null;
    const matches = (row: Row) => wanted === null || row[table.key] === wanted;

    if (request.method === "GET") {
      const rows = table.rows.filter(matches);
      if (url.searchParams.get("order") === "published_at.desc") {
        rows.sort((a, b) => String(b.published_at).localeCompare(String(a.published_at)));
      }
      return send(200, rows);
    }
    const body = JSON.parse((await readBody(request)) || "null");
    if (request.method === "POST") {
      // An upsert: POST with ?on_conflict=<column> and a merge-duplicates preference.
      if (url.searchParams.get("on_conflict") !== table.key) return send(400, { message: "no on_conflict" });
      if (!String(request.headers.prefer).includes("resolution=merge-duplicates")) {
        return send(409, { message: "duplicate key" });
      }
      for (const row of [body].flat() as Row[]) {
        const index = table.rows.findIndex((each) => each[table.key] === row[table.key]);
        if (index === -1) table.rows.push(row);
        else table.rows[index] = { ...table.rows[index], ...row };
      }
      return send(201);
    }
    if (request.method === "PATCH") {
      table.rows = table.rows.map((row) => (matches(row) ? { ...row, ...body } : row));
      return send(204);
    }
    return send(405, { message: "unsupported" });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  process.env.SUPABASE_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = KEY;
});

afterAll(() => {
  server.close();
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
});

beforeEach(() => {
  tables.posts.rows = [];
  tables.meta.rows = [];
  seen.length = 0;
});

function post(sourceId: string, publishedAt: string): StoredPost {
  return {
    sourceId,
    kind: "event",
    title: `Post ${sourceId}`,
    url: `https://example.test/${sourceId}`,
    publishedAt,
    thumbnailUrl: null,
    contentHash: "abc",
    items: [
      {
        id: "an-item",
        title: "An item",
        category: "event",
        summary: "Do it.",
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
          progression: { casual: 2, endgame: 3, returning: 4 },
          limited: 5,
          cosmetic: 6,
        },
        rewards: ["Thing"],
        startsAt: null,
        endsAt: "2026-11-10T23:59:00.000Z",
        timeEstimate: null,
        images: [],
        rewardImages: [null],
      },
    ],
    model: "gemini-3.6-flash",
    promptVersion: 5,
    classifiedAt: "2026-10-12T12:00:00.000Z",
    warnings: ["a correction"],
    error: null,
  };
}

describe("supabaseStore", () => {
  it("is chosen when the Supabase variables are set", async () => {
    const { getStore } = await import("@/lib/db/store");
    expect(getStore().name).toBe("supabase");
  });

  it("saves a post and reads it back unchanged", async () => {
    const { supabaseStore } = await import("@/lib/db/supabase-store");
    const original = post("45393", "2026-10-06T17:00:30.000Z");
    await supabaseStore.writePost(original);

    expect(tables.posts.rows[0]).toMatchObject({ source_id: "45393", prompt_version: 5 });
    expect(await supabaseStore.readPost("45393")).toEqual(original);
    expect(await supabaseStore.readPost("nope")).toBeNull();
  });

  it("updates in place instead of inserting twice", async () => {
    const { supabaseStore } = await import("@/lib/db/supabase-store");
    await supabaseStore.writePost(post("1", "2026-10-01T00:00:00.000Z"));
    await supabaseStore.writePost({ ...post("1", "2026-10-01T00:00:00.000Z"), title: "Edited" });
    expect(tables.posts.rows).toHaveLength(1);
    expect((await supabaseStore.readPost("1"))?.title).toBe("Edited");
  });

  it("lists posts newest first and skips rows it cannot validate", async () => {
    const { supabaseStore } = await import("@/lib/db/supabase-store");
    await supabaseStore.writePost(post("1", "2026-09-01T00:00:00.000Z"));
    await supabaseStore.writePost(post("2", "2026-10-01T00:00:00.000Z"));
    tables.posts.rows.push({ source_id: "broken", kind: "event" });

    const all = await supabaseStore.readAllPosts();
    expect(all.map((each) => each.sourceId)).toEqual(["2", "1"]);
  });

  it("records an error without touching the items", async () => {
    const { supabaseStore } = await import("@/lib/db/supabase-store");
    const original = post("1", "2026-10-01T00:00:00.000Z");
    await supabaseStore.writePost(original);
    await supabaseStore.recordError("1", "Gemini said no");

    const stored = await supabaseStore.readPost("1");
    expect(stored?.error).toBe("Gemini said no");
    expect(stored?.items).toEqual(original.items);
  });

  it("stores and reads small named values", async () => {
    const { supabaseStore } = await import("@/lib/db/supabase-store");
    expect(await supabaseStore.readMeta("gemini-quota")).toBeNull();
    await supabaseStore.writeMeta("gemini-quota", { models: {} });
    await supabaseStore.writeMeta("gemini-quota", { models: { a: 1 } });
    expect(await supabaseStore.readMeta("gemini-quota")).toEqual({ models: { a: 1 } });
    expect(tables.meta.rows).toHaveLength(1);
  });
});
