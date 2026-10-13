# Lazy Tracker: Spec

## 1. Overview

Lazy Tracker tells Global MapleStory (GMS) players what in the latest patch is worth their time. It scrapes official patch notes and event notices, has Gemini sort each item into `must_do` / `if_free` / `skip` for three kinds of player, fits them to the player's daily playtime, caches the result, and shows it as an illustrated quest log. It is a read-only information page: nothing is ticked off or tracked per player.

**Non-goals for v1:** accounts, cross-device sync, per-user AI calls, Cash Shop coverage, admin UI, other regions.

## 2. Requirements

| Topic | Decision |
|---|---|
| Tiering | 3 preset profiles: `casual`, `endgame`, `returning`. A profile says where the player is in the game, not how much time they have |
| Playtime | Players pick a daily playtime: 15 min, 30 min, 1 hour or no limit. One-minute claims are always Must Do; bigger quests are fitted into the time |
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
| `casual` | Settled main around level 260 to 275 | Sol Erda Fragments, symbols, reachable gear upgrades |
| `endgame` | Progression-focused bosser | Combat power, boss-relevant resources |
| `returning` | Back after a long break, usually level 200 to 260 | Levels, free gear, what changed |

A "new player" profile existed at first and was removed: its needs overlap with `returning`, and three jobs are easier to rate apart.

## 3. Architecture

Stack: Next.js App Router + TypeScript on Vercel, Supabase (Postgres) for cache, Gemini via `@google/genai`, Tailwind for styling.

```
Vercel Cron (daily, 08:30 UTC, just after Gemini's quota resets)
   └─> GET /api/cron/ingest        (checks Authorization: Bearer CRON_SECRET)
         1. scraper   list recent posts, fetch body, HTML -> clean text, hash
         2. plan      queue posts that are new, changed, or only provisionally rated
         3. batch     pack several posts into one Gemini request
         4. classify  Gemini (structured output) -> Zod validate -> grounding checks
         5. store     upsert into Supabase `posts`
         6. revalidateTag('posts') tell Next.js the cached pages are stale

Visitor ─> Server Component ─> cached read of Supabase ─> HTML
              └─ Client Components: profile picker, priorities, countdown (localStorage)
```

### Folder layout

| Path | Purpose |
|---|---|
| `app/page.tsx` | Home: one list of everything ongoing, across all recent posts |
| `app/archive/` | `page.tsx` lists every stored post; `[sourceId]/page.tsx` shows one post's quests, ended ones included |
| `app/api/cron/ingest/route.ts` | The scheduled refresh, protected by `CRON_SECRET` |
| `app/api/status/route.ts` | Health check for the operator: rating counts, last run, quota use. No secrets |
| `app/api/calendar/route.ts`, `lib/calendar.ts` | Quest end dates as an iCalendar file for a chosen job and priorities |
| `app/robots.ts`, `app/sitemap.ts`, `app/opengraph-image.tsx`, `app/error.tsx` | robots.txt, sitemap.xml, the share picture, and the page shown when rendering fails |
| `app/api/dev/try/route.ts`, `lib/dev/trial.ts` | The prompt lab: run the current prompt on chosen posts without saving, then optionally promote the result. Development only |
| `app/dev/review/page.tsx`, `lib/dev/review.ts` | Every running quest with its tiers and raw scores, and what the latest trial would change. Development only |
| `lib/ongoing.ts` | The rules for what counts as running, shared by the home page, the calendar and the prompt lab |
| `app/api/dev/ingest/route.ts` | The same run, triggered by hand. Development only (404 in production) |
| `lib/ingest.ts` | Scrape recent posts, queue the ones that need work, classify in batches, attach images, save |
| `lib/tracker.ts` | Cached reads: `getOngoing()` for the home page, `getArchive()` and `getArchivedPost()` for the archive |
| `lib/images.ts` | Image switch, title-to-section matching, reward-to-icon matching |
| `lib/scraper/` | Nexon news (cheerio for HTML to text and section images) and maplestory.io item icons |
| `lib/classifier/classify.ts` | The Gemini call: picks a model, respects the quota ledger, waits out per-minute limits |
| `lib/classifier/quota.ts` | The quota ledger: requests spent per model per day, and which models are blocked |
| `lib/classifier/batch.ts` | Packs several posts into one request |
| `lib/classifier/reply.ts`, `grounding.ts`, `dates.ts` | Validate the reply post by post, then check dates and rewards against the post text |
| `lib/classifier/rules.ts` | No-AI fallback: lists a new event unrated when every model is out of quota |
| `lib/classifier/models.ts` | Which models are trusted and which are backups |
| `lib/classifier/prompt.ts`, `schema.ts`, `calibrate.ts` | Prompt, Zod schemas, score-to-tier calibration |
| `lib/db/store.ts` | The `PostStore` interface. Picks `supabase-store.ts` when Supabase is configured, else `file-store.ts` (`.data/`), with `data/seed` as fallback |
| `supabase/schema.sql` | The two tables to create in Supabase |
| `lib/types.ts` | Shared types |
| `tests/` | Vitest tests for the ledger, the checks, the ingest flow and the Supabase store |
| `components/` | `QuestLog` (the stateful client component), `QuestItem`, `ProfilePicker`, `Countdown`, `ArchiveLog`, `SiteHeader` |
| `lib/tiering.ts` | `resolveTier()`: profile + priorities to one tier. `planDay()`: fits every quest into the player's daily playtime |
| `.claude/agents/mapler.md` | The Mapler: a reviewer agent that plays the site as each kind of player and reports wrong placements to the developer. It never edits code or spends AI quota |
| `lib/use-local-storage.ts`, `lib/use-now.ts` | Hydration-safe hooks for browser storage and the clock |
| `app/globals.css` | Theme tokens and the quest-log component styles |

### Key design decisions

1. **One Gemini call for several posts, never one per profile.** Gemini extracts the items once and returns a score for every profile on each item, so switching profile only re-groups the list. Short posts also share a request: the free tier limits requests, not text, so thirteen posts cost four requests instead of thirteen.
2. **Structured output plus Zod.** Gemini is given a JSON response schema, which forces the shape of its answer. Zod (a TypeScript runtime validation library) then re-checks the result before anything is saved, because valid JSON can still hold nonsense values.
3. **Content hash to skip work.** Nexon edits patch notes after publishing. We store a SHA-256 of the cleaned text and only call Gemini when it changes.
4. **Item IDs are clean slugs, unique per post.** They are used as React keys. Keeping them stable across re-classification is no longer required now that nothing is stored per item.
5. **Supabase is server-only.** Row Level Security (Postgres rules for who can read which rows) is enabled with no public policies. Only server code using the service-role key touches the DB; the browser never gets a Supabase key.
6. **Supabase over a key-value store.** A KV cache (Upstash, Vercel Blob) would be less setup, but the archive needs listing and sorting by date, which SQL does naturally. One table with a `jsonb` column keeps it close to "cached JSON".
7. **Two model lists in env vars.** `GEMINI_MODEL` is the ordered list of trusted models; `GEMINI_FALLBACK_MODEL` lists weaker backups. If a trusted model is overloaded, out of quota or retired, the next is tried, and the row records which one answered. See "Running out of quota" below for when backups are used.
8. **Priorities are resolved in code, not by prompting per user.** Players pick what they care about: `progression`, `limited` items, `cosmetic` (any combination). Gemini rates every item once on all three axes (progression once per profile), and `resolveTier()` in `lib/tiering.ts` returns the best rating among the chosen priorities. Switching priorities is instant and costs no AI calls.
9. **Gemini scores, code decides tiers.** Gemini returns a 0-100 score per axis. `lib/classifier/calibrate.ts` maps scores to tiers: `must_do` needs a score of 70+ and a place in the top quarter of the post for that axis; 35+ is `if_free`; the rest is `skip`. Models rank far more reliably than they follow "be strict", so this keeps `must_do` rare whichever model answers.
10a. **Value from the model, time from the code.** Gemini scores the value of the rewards only, and separately gives each quest a coarse time class: `instant` (about a minute), `short` (5 to 15 minutes a day), `medium` (15 to 45), `long` (over 45). It never sees the player's free time. The model also gives `daysPerWeek` (1 to 7), so a quest's cost is its class in minutes times the days it is played, divided by 7: a 30-minute activity claimable three days a week costs about 13 minutes a day. `planDay()` in `lib/tiering.ts` then applies these rules for the chosen playtime: (1) a quest that has not opened is set aside in a "Soon" tab and takes no time; (2) a quest costing two minutes a day or less is Must Do unless its rewards were a Skip, so a daily check-in is Must Do for everyone, and these quick quests do not use up the playtime the bigger quests compete for; (3) a quest that alone is longer than the whole playtime drops one tier; (4) the remaining Must Do quests are taken highest score first until the playtime is full, and the rest become If Free. Best first, not cheapest first: the patch's top reward must not lose its place to several small ones; (5) with no priority picked, quests that are Must Do for progression fill the day before quests that are Must Do only for cosmetics or limited items; (6) a quest that unlocks another one (the model's `requires` link, for example the rank track a prize draw needs) is never in a lower tier than the quest it unlocks, but keeps its own score for ordering; (7) with no priority picked, a Must Do needs progression value: a quest worth it only for cosmetics or limited items tops out at If Free until the player picks that priority (a one-minute claim is still promoted). Changing the playtime re-sorts the page at once and costs no AI call. A card says when playtime moved it ("1-min claim", "Over your time").
10. **No guessed time estimates.** Posts describe mechanics, not duration, and a wrong number is worse than none. Each estimate records its basis: `stated` (the post gives the duration), `calculated` (the post gives every quantity needed), or `uncertain`. An uncertain estimate says what is known and never carries a number; the code strips one if the model sends it anyway.
11. **Community research (planned, not built).** To replace `uncertain` with real figures, a research step will look up how an event played out for players and on other servers (KMS, TMS, JMS, MSEA), and estimates from it will carry a `community` basis with source links. Nothing is hard-coded per event. Every candidate source needs a credential: Reddit blocks anonymous requests (official API app required), web search across other regions' sites needs Gemini search grounding (billed) or a search API key, and Discord has no public search (a bot invited to a server is the only route).

### Rules

- `GEMINI_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY` and `CRON_SECRET` are server-only. None use the `NEXT_PUBLIC_` prefix.
- Caching uses Next 16 Cache Components: the read functions in `lib/tracker.ts` are marked `'use cache'` with `cacheTag('posts')` and `cacheLife('hours')`. Ingest calls `revalidateTag('posts', 'max')` after saving; the one-hour lifetime is the fallback. This replaces the older `export const revalidate` page setting.
- At most 3 Gemini requests are spent per cron run, and none is started after 170 seconds, to stay inside the 300-second function limit. Any backlog drains on later runs.
- If scraping, Gemini or validation fails, the row keeps its previous `items` and records `error`. Nothing live is ever replaced by a bad result.

### Running out of quota

Phase 1 ended with every post rated by `flash-lite`: the trusted models had used their 20 requests for the day and ingest fell straight through to the weakest one. These rules keep ratings accurate when that happens.

1. **Spend fewer requests.** Posts are batched (decision 1), and a quota ledger (`meta` row `gemini-quota`) remembers which models have refused. A model that is out for the day is skipped without a request, because failed requests count against the quota too.
2. **Tell the two kinds of refusal apart.** A 429 names the quota it hit. A per-minute refusal clears in seconds, so ingest waits (up to 70 seconds) and retries the same model. Only a per-day refusal moves on to the next model.
3. **Backup results are provisional.** A result from a fallback model is saved, shown with a "Rough rating" badge, and queued to be redone by a trusted model. A backup model may fill a gap (a new post), but it never overwrites a trusted result, even when the post's text has changed.
4. **Check every answer in code.** `grounding.ts` compares the reply with the post: a date or reward that does not appear in the text is removed, a coin shop listed as its own item is dropped, an estimate with no unit of time becomes `uncertain`, and a single event's end time is aligned with the period the post states. These checks cost no requests and apply to every model.
5. **Last resort, no AI.** When no model can answer, a new event notice is still listed, unrated ("Not rated yet"), with its dates read by code. Patch notes wait: they cannot be split into items without a model.

The queue order is: new posts, unrated posts, changed posts, provisional posts, then posts rated under an older prompt.

The simplest fix of all is outside the code: enabling billing on the Gemini key lifts the 20-per-day cap, and this workload is only a few requests a day (check current pricing first). Set `GEMINI_DAILY_LIMIT` and `GEMINI_RPM` to match if you do.

### Nexon images

The patch notes carry a preview and reward pictures under each event's heading. `lib/scraper/sections.ts` records heading-to-images for every section, and each classified item is matched to a section by its title (no AI involved, so only images from that post can ever be attached). The largest file in a section becomes the preview, because sections often open with a tiny item icon.

- Images are never copied or re-hosted. The browser loads them directly from Nexon's CDN, which is why `next/image` is not used.
- They appear only when `NEXON_IMAGES=1`. With it unset, the page contains no reference to Nexon's servers.
- Permission status: no Nexon fan-content policy or fansite kit was found. Nexon's legal page (dated 2011) says site text and images may not be used without express written permission; the current Terms of Service could not be read. Other fan sites show Nexon art under a self-declared fair-use claim. Treat turning this on for a public site as a deliberate decision, and prefer asking Nexon.
- Possible official route: the NEXON Open API (openapi.nexon.com) has developer terms (non-commercial, credit Nexon as the source, keep data at most 30 days). Whether it covers Global MapleStory is unconfirmed.

### Gemini free-tier limits (measured in Phase 1)

- 5 requests per minute and 20 requests per day, per model. Failed requests count. When the daily quota comes back is not known: Google documents midnight Pacific time (07:00 or 08:00 UTC), the 429 body's "retry in" pointed at 00:00 UTC on two days, and neither held when measured. On 2026-10-13 the quota was still exhausted at 00:27 UTC, and two refused models answered again at 03:50 UTC. So the ledger assumes no reset time: a model that refuses for the day is left alone for two hours and then asked again. The cron stays at 08:30 UTC, after both candidate reset times. The hash check, batching and the 3-requests-per-run cap keep the cron far inside the daily figure; development re-runs are what exhaust it.
- Three short event notices in one request came back in about 5 seconds with every post answered (measured against `flash-lite`).
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
type Profile = 'casual' | 'endgame' | 'returning';
type TimeCost = 'instant' | 'short' | 'medium' | 'long' | 'idle';
type Priority = 'progression' | 'limited' | 'cosmetic';

interface TrackerItem {
  id: string;                    // stable slug, e.g. "sunny-sunday-oct-18"
  title: string;
  category: 'event' | 'content' | 'system';
  summary: string;               // one or two sentences
  timeCost: TimeCost;            // coarse time on a day it is played, always set
  daysPerWeek: number;           // 1 to 7: how many days a week it is played
  claimUntil: string | null;     // last moment to claim rewards, when later than endsAt
  requires: string | null;       // id of the item (same post) that grants the rank or unlock this one needs
  why: string;                   // one sentence justifying the scores
  value: {
    progression: Record<Profile, Tier>;
    limited: Tier;               // rewards that may never return
    cosmetic: Tier;              // appearance and collection value
  };
  rewards: string[];             // max 5 short strings
  steps: { name: string; what: string; reward: string; startsAt: string | null }[]; // activities inside the quest, max 8
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

Gemini returns the same shape with 0-100 scores in place of tiers. The scores are stored as they are and converted to tiers when the page is built. Each item shown also carries `source.rating`: `ai` (trusted model), `backup` (fallback model, to be redone) or `unrated` (no AI rating yet).

### Supabase tables

The full script is `supabase/schema.sql`.

```sql
create table posts (
  id             bigint generated always as identity primary key,
  source_id      text not null unique,          -- Nexon's post id
  kind           text not null check (kind in ('patch','event')),
  title          text not null,
  url            text not null,
  published_at   timestamptz not null,
  thumbnail_url  text,
  content_hash   text not null,                 -- sha256 of cleaned text
  items          jsonb,                         -- StoredItem[]
  model          text,                          -- which model rated it, or 'rules'
  prompt_version int,
  warnings       jsonb not null default '[]',   -- corrections made by the grounding checks
  error          text,                          -- last failure, null when healthy
  classified_at  timestamptz,
  created_at     timestamptz not null default now()
);
create index posts_published_at_idx on posts (published_at desc);

create table meta (                             -- holds the quota ledger
  key         text primary key,
  value       jsonb not null,
  updated_at  timestamptz not null default now()
);

alter table posts enable row level security;    -- no policies: service role only
alter table meta  enable row level security;
```

### Browser storage (`localStorage`)

| Key | Value |
|---|---|
| `lazy-tracker:profile` | `Profile` |
| `lazy-tracker:priorities` | `Priority[]` (empty means all three count) |
| `lazy-tracker:playtime` | `15`, `30`, `60` or `0` (no limit). Default 30 |
| `lazy-tracker:visits` | Previous and current visit times, for the "New" marker |

### Environment variables

All server-only, documented in `.env.example`:
`GEMINI_API_KEY`, `GEMINI_MODEL`, `GEMINI_FALLBACK_MODEL`, `GEMINI_DAILY_LIMIT`, `GEMINI_RPM`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, plus one switch: `NEXON_IMAGES` (show images from Nexon's CDN and maplestory.io).

## 5. Build phases

Build order changed: the Phase 3 UI was built straight after Phase 1, ahead of Phase 2.

**Status.** All three phases are built and the site is live at https://maple-lazy-tracker.vercel.app, reading from a real Supabase project. Verified on the production URL: the pages, the calendar, the sitemap and the share image answer; the local-only routes (`/dev/review`, `/api/dev/*`) return 404; the cron route refuses a request without `CRON_SECRET`.

The database was filled from the posts graded locally with `scripts/push-to-supabase.mjs`, so no Gemini quota was spent on the first deploy. A machine whose `.env.local` holds the Supabase keys reads and writes the same database as the live site.

Still open:

1. The first scheduled cron run has to show as successful in the Vercel dashboard (the last "done when" of Phase 3).
2. The stored posts were graded with prompt versions 9 and 10; the cron re-grades them with the current version, a few requests a day.
3. `data/seed/` holds an old grading and is only shown when the store is empty.

### The ongoing view

The home page shows everything running now in one list, so players do not open posts one by one.

- **Sources.** Every stored post. A quest with an end date stays until it ends, however old its post is. Permanent items count only from posts published in the last 100 days (and only from the latest patch, see below).
- **Quests and news.** Only an activity with an end date is a quest and gets a tier. System changes and permanent content are not tasks, so a tier ("skip", "if free") makes no sense for them: they are listed untiered in a "What changed this patch" panel under the quest log, and they take no part in the ranking.
- **Steps.** A progress track (a rank, a pass, a gauge) and the minigames or missions that feed it are one quest, because the feeders are the only way to advance it and must not be costed or tiered apart. The quest carries a `steps` list so the card still shows each activity: its name, what to do, the prize it gives on its own, and when it opens. Steps are checked against the post like everything else and never add time. Nothing is special-cased per event: the model fills `steps` for any quest made of several activities.
- **Claim window.** `endsAt` is the last moment a player can make progress. When rewards can be claimed later, `claimUntil` holds that deadline: after `endsAt` the quest stays listed as a one-click "Claim rewards" Must Do until `claimUntil`, so nobody forgets rewards they earned.
- **News has no time, effort or tier.** A system change, or anything without an end date, is not a task (`isTask` in `lib/tiering.ts`). The home page lists it under "What changed this patch", an archive page under "What changed, nothing to do", and the card shows no Time, Effort or ratings whatever the stored data says. Something the player must do before a deadline (a transfer window, a compensation claim) is classified as an event, so it stays a quest.
- **Day and night mode.** A switch in the header; the choice is kept in `localStorage` (`lazy-tracker:theme`) and the device's setting is followed until one is made. `<html data-theme="dark">` is set by a small inline script in `app/layout.tsx` before the first paint, so there is no white flash, and `app/globals.css` restyles the page from that attribute. Coloured chips, gold buttons and reward slots keep their light background on purpose.
- **Feedback.** `/feedback` has a form (wrong rating, bug, idea, other); a quest card links to it with the quest's name filled in. `POST /api/feedback` validates with the shared Zod schema in `lib/feedback.ts`, refuses other origins, catches simple bots with a hidden field and limits one address to 5 messages per 10 minutes, then inserts into the `feedback` table (`supabase/schema.sql`). Messages are read in the Supabase Table Editor; without Supabase they are appended to `.data/feedback.jsonl`.
- **Checks on the model's answer (`lib/classifier/grounding.ts`).** The prompt states these rules and models still break them, so plain code enforces them after every answer: an activity that only feeds a progress track (its rewards or summary name the track's currency) is folded into the track as a step; an item that is a random draw scores at most 80; EXP Coupons and growth potions below level 260 score the same for Casual and Endgame; an amount stays only where the post writes it for that reward, and a "/week" or "/day" unit only where the post writes it after that number; a claim deadline needs the post to mention claiming at that date; days per week is worked out in code from `weeklyTarget` and `dailyCap` when the post gives both. `/api/dev/ingest?limit=0&recheck` re-runs these on stored posts with no AI call.
- **Hunting time.** A player at their own level defeats about 300 monsters in 1 to 1.2 minutes (the site owner's figure). The prompt states it, and the model also reports `killsPerDay` for hunting items; `grounding.ts` turns that count into minutes at 270 a minute and raises the time class when the model's was shorter (it never shortens it). An activity built on repeated hunting cycles (fill a gauge, deploy, hunt through waves) is a session: "medium" at least.
- **Idle quests.** An AFK activity has the time class `idle`: it uses no playtime, is not promoted as a quick claim and is not cut for time.
- **Not started yet.** A quest whose start date is in the future shows "Starts <date>" instead of a countdown.
- **Rough ratings.** When most of the list was rated by a backup model, one notice above the tabs replaces the per-quest "Rough rating" chips.
- **New since last visit.** The browser remembers the previous visit (`lazy-tracker:visits` in localStorage) and marks quests from posts published after it.
- **Scores are stored, tiers are computed on read.** Gemini's 0-100 scores are saved as they are. `getOngoing()` ranks the combined ongoing list, so items from different posts compete for the same must-do slots. Ranking inside each post would crown the only item of every single-event notice.
- **Duplicates.** The same event often appears in the patch notes and in its own notice. Items with matching titles are merged; the dedicated notice wins, then the newer post.
- **Ended items** are dropped on the server at read time, and the client moves anything that expires while the page is open into an "Ended" section.
- **Permanent items** (new content and system changes, which have no end date) are shown only for the latest patch notes. Once a newer patch is stored, the older patch's permanent items leave the home page; they stay in the archive.

### What the prompt knows about progression

The same reward is worth different amounts to different players, so the prompt (version 16) carries a short model of the game, built from Nexon's official Maple Guides and current community guides: level 200 opens 5th job and Arcane Symbols; level 260 opens 6th job, HEXA and Sacred Symbols, and Sol Erda and Fragments cannot be spent before it; growth potions only work inside their level range; strong players want free or discounted gear enhancement. EXP rewards are told apart: EXP Coupons (hunting multipliers) are an ordinary reward worth the same modest amount to every profile, endgame included; EXP Vouchers need level 200 and Advanced EXP Vouchers level 260. It also sets hard rules: a stated level or rank requirement lowers the score for profiles that cannot meet it, random rewards are scored on the usual result and worded "chance at", anything bought with NX or Maple Points scores at most 30, class-specific changes at most 30, and passive system changes at most 55.

### Picking pictures

Still pictures come first and animated GIFs last; a GIF over 6 MB is left out. The small thumbnail in the list is never a GIF. Nexon posts GIFs of 10 to 90 MB, and using the largest file as the thumbnail (the first rule tried) made the page download about 140 MB and stutter while scrolling.

### Reward icons

Each reward can carry an icon, looked up in this order:

1. Images under the item's own heading in the post. Nexon names its icon files after the item (`icon_advanced_exp_voucher.png`), so rewards are matched by filename words.
2. Images anywhere in the same post.
3. Images in any other recent post (common rewards are often illustrated only once).
4. maplestory.io, a community-run database built from the game's data files, by item name. The wording around the name is taken off first ("Chance at", amounts, "per claim"), and an item is accepted only when it adds nothing but a form word ("Coupon"), a bracketed qualifier or an amount. It is unofficial, has no uptime guarantee and runs about one patch behind, so every call fails soft.

A reward that is an effect and not an item (a discount day, "1+1 Star Force", "2x Sol Erda while hunting", a perk) is never given an item's icon, even when it names one: `isEffect` in `lib/reward-name.ts` decides, and the card shows the generic buff icon. Matching is strict on purpose: a wrong icon is worse than none. Rewards that are not items (buffs, skills, "Passive EXP") get no icon. All icons are subject to the `NEXON_IMAGES` switch.

### Phase 1: Pipeline to JSON

Scaffold Next.js + TypeScript + Tailwind. Find the news data source, build the scraper, write the prompt and Zod schema, call Gemini. Expose it on a local-only route that returns the classified JSON, and render it on a plain unstyled page.

- **Done when:** hitting the route for a real patch post returns valid `TrackerItem[]` with sensible tiers for every profile.
- **Concepts:** App Router, Route Handlers, Server vs Client Components, env vars, structured LLM output, Zod.

### Phase 2: Cache, cron, archive

Create the Supabase project and `posts` table. Add the DB layer, hash-based diffing, ID reuse on re-classification, the secured cron route and the `vercel.json` schedule. Pages read from Supabase. Add the archive list and detail routes.

- **Done when:** running ingest twice in a row makes zero Gemini calls the second time, and a deliberately broken Gemini response leaves the old data live. Both are covered by `tests/ingest.test.ts`.
- **Concepts:** Postgres + jsonb, RLS, service-role key, Vercel Cron, ISR and revalidation.

### Phase 3: Quest-log UI and launch

Quest-log theme (parchment panels, pixel heading font, tier sections as quest categories), profile and priority pickers saved in localStorage, event and reward images, live countdowns with "ending soon" highlighting, mobile layout, empty and error states, metadata. Deploy to Vercel with env vars and cron enabled.

- **Done when:** on the production URL, switching profile re-groups items, the chosen profile survives a reload, and the cron shows a successful run in the Vercel dashboard.
- **Concepts:** client state and hydration (why localStorage must be read after mount), Tailwind theming, `next/font`, deployment.
