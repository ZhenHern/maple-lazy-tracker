# Lazy Tracker: Spec

## 1. Overview

Lazy Tracker tells Global MapleStory (GMS) players what in the latest patch is worth their time. It scrapes official patch notes and event notices, has Gemini sort each item into `must_do` / `if_free` / `skip` for four player profiles, caches the result, and shows it as a quest log with a personal checklist.

**Non-goals for v1:** accounts, cross-device sync, per-user AI calls, Cash Shop coverage, admin UI, other regions.

## 2. Requirements

| Topic | Decision |
|---|---|
| Tiering | 4 preset profiles: `new`, `casual`, `endgame`, `returning` |
| Refresh | Daily Vercel Cron; visitors only ever read cache |
| Checklist | Tick-off saved in `localStorage`, no accounts |
| Content | Major patch notes + standalone event notices + browsable archive |
| Item fields | Title, tier, end date + countdown, key rewards, time estimate |
| Publishing | Auto-publish after schema validation; on failure the previous version stays live |
| Look | Quest-log UI: parchment panels, pixel headings, original art only (no Nexon assets) |

Profiles:

| Key | Who | Cares most about |
|---|---|---|
| `new` | Under roughly level 260, still building a main | Leveling events, free gear |
| `casual` | Established main, 30-60 minutes a day | Best reward per minute |
| `endgame` | Progression-focused bosser | Combat power, boss-relevant resources |
| `returning` | Back after a long break | Catch-up rewards, what changed |

## 3. Architecture

Stack: Next.js App Router + TypeScript on Vercel, Supabase (Postgres) for cache, Gemini via `@google/genai`, Tailwind for styling.

```
Vercel Cron (daily)
   └─> GET /api/cron/ingest        (checks Authorization: Bearer CRON_SECRET)
         1. scraper   list recent posts, fetch body, HTML -> clean text, hash
         2. diff      skip posts whose hash matches the DB
         3. classify  Gemini (structured output) -> Zod validate
         4. store     upsert into Supabase `posts`
         5. revalidatePath('/')    tell Next.js to rebuild cached pages

Visitor ─> Server Component ─> Supabase (read) ─> HTML
              └─ Client Components: profile picker, checkboxes, countdown (localStorage)
```

### Folder layout

| Path | Purpose |
|---|---|
| `app/page.tsx` | Home: current quest log (latest patch + unexpired event items) |
| `app/archive/page.tsx` | List of past patches |
| `app/patch/[id]/page.tsx` | One archived patch |
| `app/api/cron/ingest/route.ts` | Pipeline entry point, `maxDuration = 60` |
| `lib/scraper/` | Fetch and parse Nexon news (cheerio for HTML to text) |
| `lib/classifier/` | Prompt, Gemini call, Zod schema (`import 'server-only'`) |
| `lib/db/` | Supabase server client and queries (`import 'server-only'`) |
| `lib/types.ts` | Shared types |
| `components/` | `QuestLog`, `QuestItem`, `ProfilePicker`, `Countdown` |

### Key design decisions

1. **One Gemini call per post, not one per profile.** Gemini extracts the items once and returns a tier for every profile on each item. A quarter of the cost, and all profiles share the same items, so switching profile only re-groups the list.
2. **Structured output plus Zod.** Gemini is given a JSON response schema, which forces the shape of its answer. Zod (a TypeScript runtime validation library) then re-checks the result before anything is saved, because valid JSON can still hold nonsense values.
3. **Content hash to skip work.** Nexon edits patch notes after publishing. We store a SHA-256 of the cleaned text and only call Gemini when it changes.
4. **Stable item IDs.** Checkboxes are keyed by item ID in the browser, so IDs must survive re-classification. On re-runs, the previous items (id + title) are passed to Gemini with an instruction to reuse IDs for the same item.
5. **Supabase is server-only.** Row Level Security (Postgres rules for who can read which rows) is enabled with no public policies. Only server code using the service-role key touches the DB; the browser never gets a Supabase key.
6. **Supabase over a key-value store.** A KV cache (Upstash, Vercel Blob) would be less setup, but the archive needs listing and sorting by date, which SQL does naturally. One table with a `jsonb` column keeps it close to "cached JSON".
7. **Model name in an env var.** `GEMINI_MODEL` (a Flash-tier model) can be upgraded without a code change.

### Rules

- `GEMINI_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY` and `CRON_SECRET` are server-only. None use the `NEXT_PUBLIC_` prefix.
- Caching uses Next 16 Cache Components (on by default in new projects): data functions are marked `'use cache'` with `cacheLife('hours')` as a fallback to the explicit revalidation in step 5. This replaces the older `export const revalidate` page setting.
- At most 3 posts are classified per cron run, to stay inside the function time limit. Any backlog drains on later runs.
- If scraping, Gemini or validation fails, the row keeps its previous `items` and records `error`. Nothing live is ever replaced by a bad result.

### Data source (resolved in Phase 1)

The Nexon news site is a client-rendered shell, so we read the public JSON API it calls instead of scraping HTML pages:

- List: `https://g.nexonstatic.com/maplestory/cms/v1/news` returns every post with `id`, `name`, `category`, `liveDate`, `isMSCW`.
- Detail: `.../news/{id}` adds an HTML `body`, which is converted to plain text before it goes to Gemini (about 75% smaller).
- Tracked posts: `category: "update"` with "Patch Notes" in the title is a patch; `category: "events"` is an event. Posts with `isMSCW: true` (Classic World) are ignored.

This API is undocumented and could change without notice, so every response is validated with Zod.

## 4. Data schema

### Item shape (TypeScript, mirrored as a Zod schema)

```ts
type Tier = 'must_do' | 'if_free' | 'skip';
type Profile = 'new' | 'casual' | 'endgame' | 'returning';

interface TrackerItem {
  id: string;                    // stable slug, e.g. "sunny-sunday-oct-18"
  title: string;
  summary: string;               // one or two sentences
  tiers: Record<Profile, Tier>;
  rewards: string[];             // max 5 short strings
  startsAt: string | null;       // ISO 8601 UTC
  endsAt: string | null;         // ISO 8601 UTC, drives the countdown
  timeEstimate: { label: string; effort: 'low' | 'medium' | 'high' } | null;
}
```

### Supabase table

```sql
create table posts (
  id             bigint generated always as identity primary key,
  source_id      text not null unique,          -- Nexon's post id
  kind           text not null check (kind in ('patch','event')),
  title          text not null,
  url            text not null,
  published_at   timestamptz not null,
  content_hash   text not null,                 -- sha256 of cleaned text
  items          jsonb,                         -- TrackerItem[]; null until first success
  model          text,
  prompt_version int,
  error          text,                          -- last failure, null when healthy
  classified_at  timestamptz,
  created_at     timestamptz not null default now()
);
create index posts_published_at_idx on posts (published_at desc);
alter table posts enable row level security;    -- no policies: service role only
```

### Browser storage (`localStorage`)

| Key | Value |
|---|---|
| `lazy-tracker:profile` | `Profile` |
| `lazy-tracker:done:v1` | `{ "<source_id>:<item_id>": true }` |

### Environment variables

All server-only, documented in `.env.example`:
`GEMINI_API_KEY`, `GEMINI_MODEL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`.

## 5. Build phases

### Phase 1: Pipeline to JSON

Scaffold Next.js + TypeScript + Tailwind. Find the news data source, build the scraper, write the prompt and Zod schema, call Gemini. Expose it on a local-only route that returns the classified JSON, and render it on a plain unstyled page.

- **Done when:** hitting the route for a real patch post returns valid `TrackerItem[]` with sensible tiers for all four profiles.
- **Concepts:** App Router, Route Handlers, Server vs Client Components, env vars, structured LLM output, Zod.

### Phase 2: Cache, cron, archive

Create the Supabase project and `posts` table. Add the DB layer, hash-based diffing, ID reuse on re-classification, the secured cron route and the `vercel.json` schedule. Pages read from Supabase. Add the archive list and detail routes.

- **Done when:** running ingest twice in a row makes zero Gemini calls the second time, and a deliberately broken Gemini response leaves the old data live.
- **Concepts:** Postgres + jsonb, RLS, service-role key, Vercel Cron, ISR and revalidation.

### Phase 3: Quest-log UI and launch

Quest-log theme (parchment panels, pixel heading font, tier sections as quest categories), profile picker, checkboxes with localStorage, live countdowns with "ending soon" highlighting, mobile layout, empty and error states, metadata. Deploy to Vercel with env vars and cron enabled.

- **Done when:** on the production URL, switching profile re-groups items, ticks survive a reload, and the cron shows a successful run in the Vercel dashboard.
- **Concepts:** client state and hydration (why localStorage must be read after mount), Tailwind theming, `next/font`, deployment.
