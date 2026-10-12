# Lazy Tracker: Spec

## 1. Overview

Lazy Tracker tells Global MapleStory (GMS) players what in the latest patch is worth their time. It scrapes official patch notes and event notices, has Gemini sort each item into `must_do` / `if_free` / `skip` for four player profiles, caches the result, and shows it as an illustrated quest log. It is a read-only information page: nothing is ticked off or tracked per player.

**Non-goals for v1:** accounts, cross-device sync, per-user AI calls, Cash Shop coverage, admin UI, other regions.

## 2. Requirements

| Topic | Decision |
|---|---|
| Tiering | 4 preset profiles: `new`, `casual`, `endgame`, `returning` |
| Priorities | Players pick any of `progression`, `limited`, `cosmetic`; the tier shown is the best rating among those picked |
| Refresh | Daily Vercel Cron; visitors only ever read cache |
| Checklist | None. The page only shows information (the tick-off feature was built, then removed) |
| Content | Major patch notes + standalone event notices + browsable archive |
| Item fields | Title, tier, end date + countdown, key rewards, time estimate |
| Publishing | Auto-publish after schema validation; on failure the previous version stays live |
| Look | Quest-log UI: parchment panels, pixel headings, original art for the site itself |
| Images | Event previews and reward pictures from the official post, shown only when `NEXON_IMAGES=1` (see section 3) |

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
              └─ Client Components: profile picker, priorities, countdown (localStorage)
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
| `components/` | `QuestLog` (the only stateful client component), `QuestItem`, `ProfilePicker`, `Countdown` |
| `lib/tiering.ts` | `resolveTier()`: profile + priorities to one tier |
| `lib/use-local-storage.ts`, `lib/use-now.ts` | Hydration-safe hooks for browser storage and the clock |
| `app/globals.css` | Theme tokens and the quest-log component styles |

### Key design decisions

1. **One Gemini call per post, not one per profile.** Gemini extracts the items once and returns a tier for every profile on each item. A quarter of the cost, and all profiles share the same items, so switching profile only re-groups the list.
2. **Structured output plus Zod.** Gemini is given a JSON response schema, which forces the shape of its answer. Zod (a TypeScript runtime validation library) then re-checks the result before anything is saved, because valid JSON can still hold nonsense values.
3. **Content hash to skip work.** Nexon edits patch notes after publishing. We store a SHA-256 of the cleaned text and only call Gemini when it changes.
4. **Item IDs are clean slugs, unique per post.** They are used as React keys. Keeping them stable across re-classification is no longer required now that nothing is stored per item.
5. **Supabase is server-only.** Row Level Security (Postgres rules for who can read which rows) is enabled with no public policies. Only server code using the service-role key touches the DB; the browser never gets a Supabase key.
6. **Supabase over a key-value store.** A KV cache (Upstash, Vercel Blob) would be less setup, but the archive needs listing and sorting by date, which SQL does naturally. One table with a `jsonb` column keeps it close to "cached JSON".
7. **Model list in an env var.** `GEMINI_MODEL` is an ordered, comma-separated list. If a model is overloaded, rate limited or retired, the next is tried, and the row records which one answered.
8. **Priorities are resolved in code, not by prompting per user.** Players pick what they care about: `progression`, `limited` items, `cosmetic` (any combination). Gemini rates every item once on all three axes (progression once per profile), and `resolveTier()` in `lib/tiering.ts` returns the best rating among the chosen priorities. Switching priorities is instant and costs no AI calls.
9. **Gemini scores, code decides tiers.** Gemini returns a 0-100 score per axis. `lib/classifier/calibrate.ts` maps scores to tiers: `must_do` needs a score of 70+ and a place in the top quarter of the post for that axis; 35+ is `if_free`; the rest is `skip`. Models rank far more reliably than they follow "be strict", so this keeps `must_do` rare whichever model answers.
10. **No guessed time estimates.** Posts describe mechanics, not duration, and a wrong number is worse than none. Each estimate records its basis: `stated` (the post gives the duration), `calculated` (the post gives every quantity needed), or `uncertain`. An uncertain estimate says what is known and never carries a number; the code strips one if the model sends it anyway.
11. **Community research (planned, not built).** To replace `uncertain` with real figures, a research step will look up how an event played out for players and on other servers (KMS, TMS, JMS, MSEA), and estimates from it will carry a `community` basis with source links. Nothing is hard-coded per event. Every candidate source needs a credential: Reddit blocks anonymous requests (official API app required), web search across other regions' sites needs Gemini search grounding (billed) or a search API key, and Discord has no public search (a bot invited to a server is the only route).

### Rules

- `GEMINI_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY` and `CRON_SECRET` are server-only. None use the `NEXT_PUBLIC_` prefix.
- Caching uses Next 16 Cache Components (on by default in new projects): data functions are marked `'use cache'` with `cacheLife('hours')` as a fallback to the explicit revalidation in step 5. This replaces the older `export const revalidate` page setting.
- At most 3 posts are classified per cron run, to stay inside the function time limit. Any backlog drains on later runs.
- If scraping, Gemini or validation fails, the row keeps its previous `items` and records `error`. Nothing live is ever replaced by a bad result.

### Nexon images

The patch notes carry a preview and reward pictures under each event's heading. `lib/scraper/sections.ts` records heading-to-images for every section, and each classified item is matched to a section by its title (no AI involved, so only images from that post can ever be attached). The largest file in a section becomes the preview, because sections often open with a tiny item icon.

- Images are never copied or re-hosted. The browser loads them directly from Nexon's CDN, which is why `next/image` is not used.
- They appear only when `NEXON_IMAGES=1`. With it unset, the page contains no reference to Nexon's servers.
- Permission status: no Nexon fan-content policy or fansite kit was found. Nexon's legal page (dated 2011) says site text and images may not be used without express written permission; the current Terms of Service could not be read. Other fan sites show Nexon art under a self-declared fair-use claim. Treat turning this on for a public site as a deliberate decision, and prefer asking Nexon.
- Possible official route: the NEXON Open API (openapi.nexon.com) has developer terms (non-commercial, credit Nexon as the source, keep data at most 30 days). Whether it covers Global MapleStory is unconfirmed.

### Gemini free-tier limits (measured in Phase 1)

- 5 requests per minute and 20 requests per day, per model. Failed requests count. The cron must stay well inside the daily figure, which the hash check and the 3-posts-per-run cap already ensure.
- Google Search grounding returns 429 on the free tier, so automatic lookup of an event's history on other servers needs a billed key.
- Gemini rejects the response schema with a bare 400 if it contains `minItems`/`maxItems`, so size and range limits are enforced in our code instead.
- Full patch notes (about 45k tokens) can take over a minute, and the SDK retries five times with no timeout by default. We set a 120-second timeout and no SDK retries.

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
type Priority = 'progression' | 'limited' | 'cosmetic';

interface TrackerItem {
  id: string;                    // stable slug, e.g. "sunny-sunday-oct-18"
  title: string;
  category: 'event' | 'content' | 'system';
  summary: string;               // one or two sentences
  value: {
    progression: Record<Profile, Tier>;
    limited: Tier;               // rewards that may never return
    cosmetic: Tier;              // appearance and collection value
  };
  rewards: string[];             // max 5 short strings
  startsAt: string | null;       // ISO 8601 UTC
  endsAt: string | null;         // ISO 8601 UTC, drives the countdown
  timeEstimate: {
    label: string;               // e.g. "15 min/day", or what is known when uncertain
    minutesPerWeek: number | null;           // always null when uncertain
    effort: 'low' | 'medium' | 'high' | null; // always null when uncertain
    basis: 'stated' | 'calculated' | 'uncertain';
  } | null;                      // null = takes no meaningful time
}
```

Gemini returns the same shape with 0-100 scores in place of tiers; calibration converts them before anything is stored.

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
| `lazy-tracker:priorities` | `Priority[]` (empty means all three count) |

### Environment variables

All server-only, documented in `.env.example`:
`GEMINI_API_KEY`, `GEMINI_MODEL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, plus two switches: `TRACKER_FIXTURE` (serve the saved sample instead of calling Gemini) and `NEXON_IMAGES` (show images from Nexon's CDN).

## 5. Build phases

Build order changed: the Phase 3 UI was built straight after Phase 1, ahead of Phase 2. Until Supabase exists, the UI reads through `getClassifiedPost()` in `lib/pipeline.ts`, which serves a saved real classification (`lib/fixtures/sample-post.json`) when `TRACKER_FIXTURE=1`. Phase 2 replaces that function's body with a Supabase read; the components do not change.

### Phase 1: Pipeline to JSON

Scaffold Next.js + TypeScript + Tailwind. Find the news data source, build the scraper, write the prompt and Zod schema, call Gemini. Expose it on a local-only route that returns the classified JSON, and render it on a plain unstyled page.

- **Done when:** hitting the route for a real patch post returns valid `TrackerItem[]` with sensible tiers for all four profiles.
- **Concepts:** App Router, Route Handlers, Server vs Client Components, env vars, structured LLM output, Zod.

### Phase 2: Cache, cron, archive

Create the Supabase project and `posts` table. Add the DB layer, hash-based diffing, ID reuse on re-classification, the secured cron route and the `vercel.json` schedule. Pages read from Supabase. Add the archive list and detail routes.

- **Done when:** running ingest twice in a row makes zero Gemini calls the second time, and a deliberately broken Gemini response leaves the old data live.
- **Concepts:** Postgres + jsonb, RLS, service-role key, Vercel Cron, ISR and revalidation.

### Phase 3: Quest-log UI and launch

Quest-log theme (parchment panels, pixel heading font, tier sections as quest categories), profile and priority pickers saved in localStorage, event and reward images, live countdowns with "ending soon" highlighting, mobile layout, empty and error states, metadata. Deploy to Vercel with env vars and cron enabled.

- **Done when:** on the production URL, switching profile re-groups items, the chosen profile survives a reload, and the cron shows a successful run in the Vercel dashboard.
- **Concepts:** client state and hydration (why localStorage must be read after mount), Tailwind theming, `next/font`, deployment.
