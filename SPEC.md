# Lazy Tracker: Spec

Last brought up to date on 2026-10-13 (prompt version 16, 176 tests).

## 1. Overview

Lazy Tracker tells Global MapleStory (GMS) players what in the latest patch is worth their time. It scrapes official patch notes and event notices, has Gemini rate each activity for three kinds of player, corrects the answer with plain-code checks, fits the quests to the player's daily playtime, and shows the result as an illustrated quest log sorted into `must_do` / `if_free` / `skip`. It is a read-only information page: nothing is ticked off or tracked per player.

The site is live at https://maple-lazy-tracker.vercel.app. The goal that decides trade-offs: **spend no money, and sort the way an experienced endgame player would tell a friend.**

**Non-goals for v1:** accounts, cross-device sync, per-user AI calls, Cash Shop coverage, admin UI, other regions.

## 2. Requirements

| Topic | Decision |
|---|---|
| Tiering | 3 preset profiles: `casual`, `endgame`, `returning`. A profile says where the player is in the game, not how much time they have |
| Playtime | Players pick a daily playtime: 15 min, 30 min, 1 hour or no limit. One-minute claims are always Must Do; bigger quests are fitted into the time |
| Priorities | Players pick any of `progression`, `limited`, `cosmetic`. With one or more picked, the tier is the best rating among them. With none picked, a Must Do needs progression value |
| Quests, news, schedules | Only a dated activity is a quest and gets a tier. System changes and permanent content are news. A rotating schedule of perk days (Sunny Sunday) has a panel of its own |
| Refresh | Daily Vercel Cron; visitors only ever read cache |
| Checklist | None. The page only shows information (the tick-off feature was built, then removed) |
| Content | Major patch notes + standalone event notices + browsable archive |
| Item fields | Title, tier, dates and countdown, claim deadline, key rewards with icons, steps, time class, the reason for the rating |
| Publishing | Auto-publish after schema validation and grounding checks; on failure the previous version stays live |
| Look | Quest-log UI in the style of the game: panels, pixel headings, original art for the site itself, day and night mode |
| Images | Event previews and reward pictures from the official post and maplestory.io, shown only when `NEXON_IMAGES=1` |
| Feedback | A public form for wrong ratings, bugs and ideas, saved to Supabase |

Profiles:

| Key | Who | Cares most about |
|---|---|---|
| `casual` | Settled main around level 260 to 275 | Sol Erda Fragments, symbols, reachable gear upgrades |
| `endgame` | Progression-focused bosser, 275+ | Combat power, boss-relevant resources |
| `returning` | Back after a long break, usually level 200 to 260 | Levels, free gear, what changed |

A "new player" profile existed at first and was removed: its needs overlap with `returning`, and three jobs are easier to rate apart.

## 3. Architecture

Stack: Next.js 16 App Router + TypeScript on Vercel, Supabase (Postgres) for storage, Gemini via `@google/genai`, Tailwind v4 for styling, Zod for validation, Vitest for tests.

The app has two paths that meet at the database. Path A writes once a day and is the only code that calls Gemini. Path B reads on every visit.

```
PATH A: Vercel Cron (daily, 08:30 UTC)
   └─> GET /api/cron/ingest        (checks Authorization: Bearer CRON_SECRET)
         1. scrape    list recent posts, fetch body, HTML -> clean text, hash
         2. plan      queue posts that are new, unrated, changed, provisional, or on an old prompt
         3. batch     pack several posts into one Gemini request
         4. classify  Gemini (structured output) -> Zod validate
         5. ground    plain-code checks against the post text; schedule tables read by code
         6. pictures  reward icons and previews from the post, then maplestory.io
         7. store     upsert into Supabase `posts`
         8. revalidateTag('posts')  tell Next.js the cached pages are stale

PATH B: Visitor ─> Server Component ─> cached read of Supabase ─> HTML
                     └─ Client Components: job, priorities, playtime, countdowns,
                        day/night switch, schedule panel (all from the browser's
                        own clock and localStorage; no request to the server)
```

### Folder layout

| Path | Purpose |
|---|---|
| `app/page.tsx` | Home: the quest log, the schedule panel, "What changed this patch", and the source posts |
| `app/archive/` | `page.tsx` lists every stored post; `[sourceId]/page.tsx` shows one post's quests and changes, ended ones included |
| `app/feedback/page.tsx`, `components/feedback-form.tsx` | The feedback page and its form |
| `app/api/cron/ingest/route.ts` | The scheduled refresh, protected by `CRON_SECRET` |
| `app/api/feedback/route.ts` | Receives the feedback form: validates, refuses other origins, traps bots, rate-limits, saves |
| `app/api/status/route.ts` | Health check for the operator: store, rating counts, posts on an old prompt, quota per model. No secrets |
| `app/api/calendar/route.ts`, `lib/calendar.ts` | Quest end dates as an iCalendar file for a chosen job, priorities and playtime |
| `app/api/dev/ingest/route.ts` | The daily run by hand. `&images` re-picks pictures, `&recheck` re-runs the grounding checks, both without an AI call. Development only (404 in production) |
| `app/api/dev/try/route.ts`, `lib/dev/trial.ts` | The prompt lab: run the current prompt on chosen posts without saving, then optionally promote the result. Development only |
| `app/dev/review/page.tsx`, `lib/dev/review.ts` | Every running quest with its tiers and raw scores per job and playtime, and what the latest trial would change. Development only |
| `app/icon.svg`, `app/apple-icon.tsx`, `app/manifest.ts` | The Lazy Shroom as tab icon and phone home-screen icon, and the web manifest |
| `app/robots.ts`, `app/sitemap.ts`, `app/opengraph-image.tsx`, `app/error.tsx`, `app/not-found.tsx` | robots.txt, sitemap.xml, the share picture, and the pages shown on a failure or a wrong address |
| `app/layout.tsx`, `app/globals.css` | Fonts, metadata, the script that sets day or night before the first paint; theme tokens and all component styles |
| `lib/ingest.ts` | Path A in one function: scrape, queue, classify in batches, ground, attach pictures, save |
| `lib/tracker.ts` | Cached reads: `getOngoing()` for the home page, `getArchive()` and `getArchivedPost()` for the archive |
| `lib/ongoing.ts` | The rules for what is shown: running or ended, quest or news or schedule, duplicates across posts. Pure code, shared by the home page, the calendar and the prompt lab |
| `lib/tiering.ts` | `resolveTier()`: job + priorities to one tier. `planDay()`: fits quests into the daily playtime. `isTask()`, `isSchedule()` |
| `lib/classifier/prompt.ts`, `schema.ts` | The prompt (with `PROMPT_VERSION`) and the Zod schemas for Gemini's reply and for stored posts |
| `lib/classifier/classify.ts`, `models.ts`, `quota.ts`, `batch.ts` | The Gemini call: which models, the quota ledger, waiting out limits, packing posts into requests |
| `lib/classifier/reply.ts`, `grounding.ts`, `dates.ts` | Validate the reply post by post, then correct it against the post text |
| `lib/classifier/schedule.ts` | Reads a dated schedule table (Sunny Sunday) out of a post, in plain code |
| `lib/classifier/calibrate.ts` | Scores to tiers, ranked across the whole list |
| `lib/classifier/rules.ts` | No-AI fallback: lists a new event unrated when no model answers |
| `lib/scraper/` | Nexon news (`nexon.ts`, `html-to-text.ts`, `sections.ts`) and maplestory.io item icons (`maplestory-io.ts`) |
| `lib/images.ts`, `lib/reward-name.ts`, `lib/reward-kind.ts` | Picking previews; matching a reward to an icon file; taking the wording off a reward line; telling an item from an effect; the generic icon for a kind of reward |
| `lib/db/store.ts`, `supabase-store.ts`, `file-store.ts`, `feedback-store.ts` | The `PostStore` interface with its Supabase and local-file versions (`.data/`, with `data/seed` as fallback), and where feedback is saved |
| `lib/feedback.ts`, `lib/site.ts`, `lib/types.ts` | The feedback schema shared by form and server; site name, address and storage key of the theme; shared types |
| `lib/use-local-storage.ts`, `lib/use-now.ts`, `lib/use-last-visit.ts` | Hydration-safe hooks for browser storage, the clock, and the "New" marker |
| `components/` | `QuestLog` (the stateful client component), `QuestItem`, `ProfilePicker`, `QuestTools`, `SchedulePanel`, `NpcDialog`, `StatusBar`, `Countdown`, `ArchiveLog`, `SiteHeader` and footer, `ThemeToggle`, `FeedbackForm`, `EasterEggs`, `ZoomImage`, `PixelSprite`, `Scenery`, and the arcade layer: `DayPlan`, `JobChangeBanner`, `Hotkeys`, `SoundToggle`, `ArcadeFx` |
| `lib/day-plan.ts`, `lib/sfx.ts` | `planBar()` and `laziness()`: the numbers behind "Today's Plan" (pure code, tested in `tests/day-plan.test.ts`); the 8-bit sound blips and the key of the Sounds switch |
| `supabase/schema.sql` | The three tables to create in Supabase |
| `scripts/push-to-supabase.mjs` | Copies locally graded posts into Supabase. Used once, for the first deploy |
| `tests/` | 16 Vitest files: quota ledger, classifier and grounding rules, schedule parser, ingest flow, Supabase store, tiering, day plan, ongoing rules, calendar, review, icon and reward-name matching, feedback schema |
| `.claude/agents/mapler.md` | The Mapler: a reviewer agent that reads the site as each kind of player and reports wrong placements. It never edits code or spends AI quota |
| `.claude/agents/code-reviewer.md` | The code reviewer: checks a change against the project's rules, runs lint, types, tests and build, and reports ranked findings. Its memory in `.claude/agent-memory/code-reviewer/` counts recurring issues; a hook (`.claude/hooks/review-memory-only.mjs`) lets it write only there |

### Key design decisions

1. **One Gemini call for several posts, never one per profile.** Gemini extracts the items once and returns a score for every profile on each item, so switching profile only re-groups the list. Short posts share a request (up to 6 posts or 120k characters): the free tier limits requests, not text.
2. **Structured output plus Zod.** Gemini is given a JSON response schema, which forces the shape of its answer. Zod (a TypeScript runtime validation library) then re-checks the result before anything is saved, because valid JSON can still hold nonsense values.
3. **The model reports, code decides.** This runs through the whole design. Gemini returns scores, a time class and plain numbers from the post; code turns scores into tiers, fits the day, works out days per week and hunting time, reads schedule tables, and removes what the post does not support. Models rank and read well and follow rules unreliably.
4. **Content hash to skip work.** Nexon edits patch notes after publishing. We store a SHA-256 of the cleaned text and only call Gemini when it changes.
5. **Supabase is server-only.** Row Level Security (Postgres rules for who can read which rows) is enabled with no public policies. Only server code using the service-role key touches the database; the browser never gets a Supabase key.
6. **Supabase over a key-value store.** The archive needs listing and sorting by date, which SQL does naturally. One table with a `jsonb` column keeps it close to "cached JSON", so a new field on a quest needs no database change.
7. **Two model lists in env vars.** `GEMINI_MODEL` is the ordered list of trusted models; `GEMINI_FALLBACK_MODEL` lists weaker backups. If a trusted model is overloaded, out of quota or retired, the next is tried, and the row records which one answered.
8. **Priorities are resolved in code.** Gemini rates every item once on all three axes (progression once per profile). `resolveTier()` returns the best rating among the chosen priorities. With none chosen, a Must Do needs progression value: a quest worth it only for cosmetics or limited items tops out at If Free. Switching is instant and costs no AI call.
9. **Scores to tiers by rank.** `calibrate.ts`: `must_do` needs a score of 70+ and a place in the top quarter of the whole ongoing list for that axis; 35+ is `if_free`; the rest is `skip`. Ranking across the combined list, not inside each post, keeps the only item of a single-event notice from being crowned.
10. **Value from the model, time from the code.** Gemini scores the value of the rewards only, and separately gives each quest a time class: `instant` (about a minute), `short` (5 to 15 minutes), `medium` (15 to 45), `long` (over 45), or `idle` (runs while AFK). It never sees the player's free time. `planDay()` does the fitting (section 5).
11. **No guessed time estimates.** Each estimate records its basis: `stated` (the post gives the duration), `calculated` (it follows from quantities in the post, such as a kill count), or `uncertain`. An uncertain estimate never carries a number, and the card then says "The post does not say."
12. **Nothing is special-cased per event.** No rule names an event. Checks are written for a shape (a feeder activity, a dated table, a random draw) so they still apply next patch.
13. **Community research (planned, not built).** A research step that looks up how an event played out for players. Every candidate source needs a credential: Reddit blocks anonymous requests, web search needs Gemini search grounding (billed) or a search API key, and Discord has no public search.

### Rules

- `GEMINI_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY` and `CRON_SECRET` are server-only. None use the `NEXT_PUBLIC_` prefix. Files that touch them start with `import "server-only"`.
- Caching uses Next 16 Cache Components: the read functions in `lib/tracker.ts` are marked `'use cache'` with `cacheTag('posts')` and `cacheLife('hours')`. Ingest calls `revalidateTag('posts', 'max')` after saving; the one-hour lifetime is the fallback. A re-grade run on a developer's machine does not clear Vercel's cache, so the live page catches up within the hour.
- A cron run spends at most 3 answered Gemini requests and starts none after 170 seconds, to stay inside the 300-second function limit. Any backlog drains on later runs.
- If scraping, Gemini or validation fails, the row keeps its previous `items` and records `error`. Nothing live is ever replaced by a worse result.
- A machine whose `.env.local` holds the Supabase keys reads and writes the same database as the live site.

### Running out of quota

Phase 1 ended with every post rated by the weakest model: the trusted ones had used their requests for the day and ingest fell straight through. These rules keep ratings accurate when that happens.

1. **Spend fewer requests.** Posts are batched, and a quota ledger (`meta` row `gemini-quota`) remembers which models have refused, so a blocked model is skipped without a request.
2. **Tell the kinds of refusal apart.** A per-minute 429 clears in seconds, so ingest waits (up to 70 seconds) and retries the same model. A per-day 429 blocks the model for two hours, after which it is simply asked again; no reset time is assumed. A 503 (overloaded) blocks it for ten minutes, so later batches in the same run go straight to a model that answers.
3. **Failed attempts do not end the run.** When another model then answers, the attempts on busy models are not charged to the 3-request budget.
4. **Backup results are provisional.** A result from a fallback model is saved, shown with a "Rough rating" badge, and queued to be redone by a trusted model. A backup model may fill a gap (a new post), but it never overwrites a trusted result.
5. **Check every answer in code.** See section 6. These checks cost no requests and apply to every model.
6. **Last resort, no AI.** When no model can answer, a new event notice is still listed, unrated, with its dates read by code. Patch notes wait: they cannot be split into items without a model.

The queue order is: new posts, unrated posts, changed posts, provisional posts, then posts rated under an older prompt; newer posts first within each.

Enabling billing on the Gemini key would lift the daily cap. It is not planned: the goal is to spend nothing.

### Gemini free-tier limits (measured)

- About 5 requests per minute and 20 requests per day, per model.
- When the daily quota comes back is not known. Google documents midnight Pacific time, the 429 body's "retry in" pointed at 00:00 UTC, and neither held when measured: on 2026-10-13 the quota was still exhausted at 00:27 UTC, and two refused models answered again at 03:50 UTC. Hence the two-hour pause instead of a reset time.
- On the first scheduled run (2026-10-13) three of four trusted models answered 503. The fourth graded the posts.
- Three short event notices in one request came back in about 5 seconds.
- Gemini rejects the response schema with a bare 400 if it contains `minItems`/`maxItems`, so size and range limits are enforced in our code.
- Full patch notes (about 45k tokens) can take over a minute, and the SDK retries five times with no timeout by default. We set a 120-second timeout and no SDK retries.
- Google Search grounding returns 429 on the free tier.

### Data source

The Nexon news site is a client-rendered shell, so we read the public JSON API it calls:

- List: `https://g.nexonstatic.com/maplestory/cms/v1/news` returns every post with `id`, `name`, `category`, `liveDate`, `isMSCW`.
- Detail: `.../news/{id}` adds an HTML `body`, which is converted to plain text before it goes to Gemini (about 75% smaller). Tables become lines ending in ` |`, which is what the schedule reader relies on.
- Tracked posts: `category: "update"` with "Patch Notes" in the title is a patch; `category: "events"` is an event. Posts with `isMSCW: true` (Classic World) are ignored.

This API is undocumented and could change without notice, so every response is validated with Zod.

### Nexon images

- Images are never copied or re-hosted. The browser loads them from Nexon's CDN and from maplestory.io, which is why `next/image` is not used.
- They appear only when `NEXON_IMAGES=1`. With it unset, the page contains no reference to those servers.
- **Decision (2026-10-13):** the live site runs with `NEXON_IMAGES=1`. No Nexon fan-content policy was found, and Nexon's legal page says its images may not be used without permission. The footer on every page says the site is an unofficial, non-commercial fan project, that all game images belong to Nexon, and that a rights holder can ask for removal through a GitHub issue. Removal is one step: delete the variable in Vercel and redeploy.

## 4. Data schema

### Item shape (TypeScript, mirrored as a Zod schema in `lib/classifier/schema.ts`)

```ts
type Tier = 'must_do' | 'if_free' | 'skip';
type Profile = 'casual' | 'endgame' | 'returning';
type TimeCost = 'instant' | 'short' | 'medium' | 'long' | 'idle';
type Priority = 'progression' | 'limited' | 'cosmetic';

interface TrackerItem {
  id: string;                    // slug, unique per post; prefixed with the post id when shown
  title: string;
  category: 'event' | 'content' | 'system';
  summary: string;               // one or two sentences
  why: string;                   // one sentence justifying the scores
  timeCost: TimeCost;            // time on a day it is played, always set
  daysPerWeek: number;           // 1 to 7: how many days a week it is played
  weeklyTarget: number | null;   // amount to reach per week, when the post gives it...
  dailyCap: number | null;       // ...and the cap per day; code derives daysPerWeek from the two
  killsPerDay: number | null;    // monsters to defeat on a day played; code derives the time
  requires: string | null;       // id of the item (same post) that grants the rank or unlock this one needs
  value: {
    progression: Record<Profile, Tier>;
    limited: Tier;               // rewards that may never return
    cosmetic: Tier;              // appearance and collection value
  };
  rewards: string[];             // max 5 short strings
  rewardImages: (string | null)[]; // parallel to rewards: the icon, or null for the generic one
  images: string[];              // previews of the event
  steps: {                       // activities inside the quest, or the days of a schedule
    name: string;
    what: string;
    reward: string;
    startsAt: string | null;     // when it opens, if later than the quest
    endsAt: string | null;       // when it is over, if earlier than the quest
  }[];
  startsAt: string | null;       // ISO 8601 UTC
  endsAt: string | null;         // last moment to make progress; drives the countdown
  claimUntil: string | null;     // last moment to claim rewards, when later than endsAt
  timeEstimate: {
    label: string;
    minutesPerWeek: number | null;            // always null when uncertain
    effort: 'low' | 'medium' | 'high' | null; // always null when uncertain
    basis: 'stated' | 'calculated' | 'uncertain';
  } | null;                      // null for news and schedules
}
```

Gemini returns the same shape with 0-100 scores in place of tiers and without the image fields. The scores are stored as they are and converted to tiers when the page is built. Each item shown also carries `source.rating`: `ai` (trusted model), `backup` (fallback model, to be redone) or `unrated`.

Fields added over time have a default in the stored schema, so posts saved before a field existed still load.

### Supabase tables

The full script is `supabase/schema.sql`. All three tables have Row Level Security on with no policies.

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
  items          jsonb,                         -- StoredItem[]: quests, news and schedules of the post
  model          text,                          -- which model rated it, or 'rules'
  prompt_version int,
  warnings       jsonb not null default '[]',   -- what the grounding checks corrected
  error          text,                          -- last failure, null when healthy
  classified_at  timestamptz,
  created_at     timestamptz not null default now()
);

create table meta (                             -- holds the quota ledger ('gemini-quota')
  key         text primary key,
  value       jsonb not null,
  updated_at  timestamptz not null default now()
);

create table feedback (                         -- messages from /feedback
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  kind        text not null check (kind in ('rating','bug','idea','other')),
  message     text not null,                    -- 1 to 2000 characters
  about       text,                             -- the quest it is about, if any
  contact     text,                             -- optional, only to reply
  page        text,                             -- where the form was sent from
  user_agent  text,
  handled     boolean not null default false    -- ticked by hand in the Table Editor
);
```

### Browser storage (`localStorage`)

| Key | Value |
|---|---|
| `lazy-tracker:profile` | `Profile` |
| `lazy-tracker:priorities` | `Priority[]` (empty: a Must Do needs progression value) |
| `lazy-tracker:playtime` | `15`, `30`, `60` or `0` (no limit). Default 30 |
| `lazy-tracker:theme` | `"light"` or `"dark"`. Absent: follow the device |
| `lazy-tracker:visits` | Previous and current visit times, for the "New" marker |
| `lazy-tracker:pokes` | How often the Lazy Shroom was poked, for its titles |
| `lazy-tracker:sound` | `true` when the visitor switched Sounds on. Absent: off |

### Environment variables

All server-only, documented in `.env.example`:
`GEMINI_API_KEY`, `GEMINI_MODEL`, `GEMINI_FALLBACK_MODEL`, `GEMINI_DAILY_LIMIT`, `GEMINI_RPM`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, `NEXON_IMAGES` (show images from Nexon's CDN and maplestory.io), and `SITE_URL` (optional; on Vercel the production address is picked up by itself).

## 5. How the page is built

### What is shown (`lib/ongoing.ts`)

The home page shows everything running now in one place, so players do not open posts one by one.

- **Sources.** Every stored post. A dated quest stays until it ends, however old its post is.
- **Quests.** An item with an end date that is not a system change (`isTask`). Only quests get tiers.
- **Claim window.** `endsAt` is the last moment to make progress. When rewards can be claimed later, `claimUntil` holds that deadline: the quest stays listed as a one-click "Claim rewards" Must Do until then.
- **News.** A system change, or anything without an end date. Listed untiered under "What changed this patch" on the home page and "What changed, nothing to do" on an archive page. A news card shows no time, effort, ratings or rewards. News comes only from the latest patch notes and from notices published since, and never includes something sold for NX or Maple Points. Something the player must do before a deadline (a transfer window, a compensation claim) is classified as an event, so it stays a quest.
- **Schedules.** A rotating schedule of perk days (Sunny Sunday) is neither: it has its own panel (`components/schedule-panel.tsx`) showing the visitor's current time, the day that is live, the next one with a countdown, the later ones and the ones already over. `isSchedule` recognises it by shape: at least two steps, each a dated day of 36 hours or less.
- **Steps.** A progress track and the activities that feed it are one quest; the card lists each activity under "How to progress" with the prize it gives on its own and when it opens. A step whose end has passed is hidden.
- **Duplicates.** The same event often appears in the patch notes and in its own notice. Items are merged when their titles match and their deadlines are within three weeks, or when they end on the same day and share half their reward words (40% is enough when they also start on the same day). A patch entry named after a notice that is already contributing quests is dropped. The dedicated notice wins, then the newer post.
- **Ended items** are dropped on the server at read time, and the client moves anything that expires while the page is open into an "Ended" tab.
- **Not started yet.** A quest whose start date is ahead sits in a "Soon" tab and shows "Starts <date>".

### How a quest gets its tier

1. **The model** scores the value of the rewards per job, plus limited and cosmetic value, and gives the time class.
2. **Grounding** corrects the answer (section 6).
3. **Calibrate** turns scores into tiers by rank across the whole list (decision 9).
4. **`planDay()`** in `lib/tiering.ts` fits the day, in the browser. A quest's daily cost is its time class in minutes (instant 1, short 10, medium 30, long 75, idle 0) times the days a week it is played, divided by 7. The rules, in order:
   1. Not open yet: set aside under "Soon"; it takes no time.
   2. Ended, but rewards can still be claimed: a one-click Must Do until the claim deadline, unless its rewards were a Skip.
   3. Idle (AFK): takes no playtime and keeps the tier its rewards earn; it is not promoted.
   4. Two minutes a day or less: Must Do unless it was a Skip, so a daily check-in is Must Do for everyone. These quick quests do not use up the playtime the bigger quests compete for.
   5. Longer than the whole playtime: drops one tier.
   6. The remaining Must Do quests are taken best score first until the playtime is full; the rest become If Free. Best first, not cheapest first.
   7. With no priority picked, quests that are Must Do for progression fill the day before the others.
   8. A quest that unlocks another one (`requires`) is never in a lower tier than the quest it unlocks, but keeps its own score for ordering.

Changing job, priorities or playtime re-sorts the page at once and costs no AI call. A card says when the plan moved it ("Takes a minute", "Over your time", "Claim rewards", "Not open yet").

### What the prompt knows about the game

The same reward is worth different amounts to different players, so the prompt carries a short model of the game, built from Nexon's official Maple Guides and the site owner's corrections. Reddit and Discord could not be read by the tools, so nothing in it comes from them.

- Level 200 opens 5th job and Arcane Symbols; level 260 opens 6th job, HEXA and Sacred Symbols. Sol Erda and Fragments cannot be spent before 260.
- EXP Coupons (hunting multipliers) are an ordinary reward worth the same modest amount to every profile, endgame included. EXP Vouchers need level 200, Advanced EXP Vouchers 260. Growth potions only work inside their level range.
- A daily check-in or one-click claim is worth doing for everyone.
- **Hunting speed:** a player at their own level defeats about 300 monsters in 1 to 1.2 minutes. An activity built on repeated hunting cycles (fill a gauge, deploy, hunt through waves) is a session: "medium" at least.
- Hard rules: a stated level or rank requirement lowers the score for profiles that cannot meet it; random rewards are scored on the usual result and worded "Chance at"; anything bought with NX or Maple Points scores at most 30; class-specific changes at most 30; passive system changes at most 55; a perk limited to listed items says so; no superlatives the post does not contain; no calendar dates in the reason.
- Merging rules: a coin shop is never its own item; a progress track and its feeders are one item with steps; a check-in and a hunting mission stay separate items; a part of an event that ends with the event is a step of it, not a system change.

Raising `PROMPT_VERSION` is how the daily job knows which posts to re-grade.

### Comforts and extras

- **Day and night mode.** A switch in the header; the device's setting is followed until a choice is made. `<html data-theme="dark">` is set by a small inline script before the first paint, so there is no white flash. Coloured chips, gold buttons and reward slots keep their light background on purpose.
- **Quest tools.** Above the quest list: the time to the daily reset (00:00 UTC, also on the visitor's own clock) and a button that copies the Must Do list as text for a guild chat. The calendar link downloads the deadlines as an `.ics` file.
- **New since last visit.** Quests from posts published after the previous visit are marked "New".
- **Rough ratings.** When most of the list was rated by a backup model, one notice above the tabs replaces the per-quest badges.
- **Feedback.** `/feedback` (wrong rating, bug, idea, other); a quest card links to it with the quest's name filled in. `POST /api/feedback` validates with the shared Zod schema, refuses other origins, catches simple bots with a hidden field, limits one address to 5 messages per 10 minutes, and inserts into the `feedback` table. Without Supabase, messages are appended to `.data/feedback.jsonl`.
- **Lazy Shroom.** The NPC summarises the day in a few lines. Poking it shows damage numbers; 25 and 100 pokes earn a title; it has a line for visitors up past midnight. The Konami code plays a level-up banner (`components/easter-eggs.tsx`).
- **Arcade layer.** Game feel on top of the page, all read-only (nothing is tracked per player) and none of it touches the pictures that carry information:
  - *Today's Plan*: an MP-style bar with one block per Must Do quest, sized by its daily minutes against the chosen playtime; a block or chip jumps to that quest's card. A laziness meter shows the share of the list that is If Free or Skip.
  - *Quest frames*: Must Do cards get a gold inner glow; a quest ending within three days pulses red. Glows are inset, so they sit under the pictures.
  - *Class-change banner* when the job is changed.
  - *Hotkeys* (`?` opens the list; keys avoid the Konami code's arrows, B and A).
  - *Click sparks* on controls and, when Sounds is on, 8-bit blips. Sounds are off by default (`lazy-tracker:sound`). Reduced motion turns the sparks and banner off.
- **Icons.** The tab icon and the phone home-screen icon are the Lazy Shroom, drawn from the same pixel grid as the sprite; `app/manifest.ts` lets the site be added to a home screen.

## 6. Checks on the model's answer (`lib/classifier/grounding.ts`)

The prompt states most of these rules and models still break them, so plain code enforces them after every answer. What was corrected is saved in the post's `warnings`. `/api/dev/ingest?limit=0&recheck` re-runs them on stored posts with no AI call.

| Check | What it does |
|---|---|
| Dates | A start, end or claim date that the post never mentions is cleared. A claim deadline also needs the post to talk about claiming at that date; an item's expiry date is not one |
| Rewards | A reward whose words are not in the post is removed. An amount stays only where the post writes it for that reward (or alone in a table cell), and a "/week" or "/day" unit only where the post writes it after that number |
| Shops and repeats | A coin shop listed as its own item and exact duplicate titles are removed |
| Feeders | An activity that only feeds a progress track (its rewards or summary name the track's currency, such as "Designer EXP") is folded into the track as a step. An AFK seat counts |
| Draws | An item whose rewards are mostly "Chance at ...", or that calls itself random, scores at most 80 |
| Settled players | EXP Coupons and growth potions below level 260 score the same for Casual and Endgame |
| Days per week | Worked out from `weeklyTarget` and `dailyCap` when the post contains both numbers |
| Hunting time | `killsPerDay` is turned into minutes at 270 monsters a minute. It can raise the time class, never lower it |
| News | A system change or an item with no end date gets no time estimate |
| Estimates | An estimate with no unit of time becomes `uncertain`; an event with none gets "not stated" |
| Schedules | A table with a "Date" column and at least two dated rows of perks (`schedule.ts`) is stored as an item whose steps are its days, replacing whatever the model returned for it |
| Single events | The end time of a one-event notice is aligned with the period the post states |

## 7. Pictures

### Previews

Still pictures come first and animated GIFs last; a GIF over 6 MB is left out. The small thumbnail in the list is never a GIF. Nexon posts GIFs of 10 to 90 MB, and using the largest file as the thumbnail made the page download about 140 MB and stutter while scrolling.

### Reward icons

A wrong icon is worse than none. Each reward is looked up in this order:

1. Images under the item's own heading in the post, then anywhere in the post, then in any other recent post. Nexon names its icon files after the item (`icon_advanced_exp_voucher.png`), so the match is on filename words.
2. maplestory.io, a community-run database built from the game's data files, by item name. It is unofficial and runs about one patch behind, so every call fails soft.

Rules that apply to both:

- **The wording comes off first** (`lib/reward-name.ts`): "Chance at", "Up to 500 ... per claim", amounts, a trailing "compensation". Plurals are tried in the singular, a spaced slash is written the way the game does, and "A & B" is read as two items.
- **It must be the same item.** A file or database item may add or drop only a word for the item's form (coupon, voucher, box, chair, title...), a bracketed qualifier or an amount. So Sol Erda, Sol Erda Fragment and Sol Erda Energy are three things; a selector coupon is not the item it selects; enhancement scrolls are told apart by star count; brackets that both carry numbers ("Lv. 250", "30 min") must agree. A family prefix ("Star Force 22-Star Enhancement (Lv. 200)") is accepted only when the bracket agrees.
- **A screenshot is not an icon.** Files named `ui_...` are never used.
- **An effect is not an item** (`isEffect`). A discount day, "1+1 Star Force", "2x Sol Erda while hunting", a perk or a buff gets no item icon even when it names one, and shows the generic buff icon.
- A reward without an icon shows a generic icon for its kind (`lib/reward-kind.ts`).

## 8. Status

**Live.** https://maple-lazy-tracker.vercel.app on Vercel, reading a real Supabase project. Verified on the production URL: the pages, the calendar, the sitemap and the share image answer; the local-only routes return 404; the cron route refuses a request without `CRON_SECRET`. The first scheduled cron run succeeded on 2026-10-13, and a manual run after it. The `feedback` table exists and has received a message.

**Review done so far.** Five rounds of the Mapler reviewer and one icon review by a tester agent that looked at every picture; their findings became the checks in sections 6 and 7.

**Open.**

1. Only the two main event notices (45330, 45393) are graded with prompt 16. Ten posts are on version 13 and one on 9; the daily job re-grades them, a few requests a run. Until the v.271 patch notes are re-graded, Night of the Yeti is costed at 7 days a week.
2. The time for Go Go Sidekick is the model's "medium" (15 to 45 minutes). The post gives no run length; a real figure from a player would settle it.
3. There is no fixed list of expected placements. "Are the tiers right?" is still answered by a reviewer agent's opinion; a small table of known-correct answers as a test would make prompt changes checkable.
4. Not yet run: a security review of the public feedback endpoint.
5. Not built: a weekly-reset countdown (the reset day for GMS was not confirmed), community research for time estimates.
6. Reward icons for some real items are still generic: maplestory.io is a patch behind (Special Arcane and Sacred Symbol Boxes, Frieren totems), or the model words them loosely ("Hair & Face Transfer Coupons").
7. A dated table that is not a perk rotation (a maintenance timetable with a "Date" column) would also be read as a schedule. None of the stored posts has one.
8. When new patch notes arrive before the old rotation's last day, two schedule panels may show for a few days. Not yet observed.

**Local development notes.** `npm run dev`, `npm test`, `npm run lint`, `npm run build`. After a production build, or after a dev server was killed, delete `.next/dev` before starting `next dev` again: a stale folder once made the page reload in a loop.

## 9. How it was built

The order changed from the plan: the Phase 3 UI was built straight after Phase 1, ahead of Phase 2.

- **Phase 1, pipeline to JSON.** Scaffold, find the news data source, scraper, prompt and Zod schema, the Gemini call, a local-only route returning classified JSON.
- **Phase 2, cache, cron, archive.** The store interface with file and Supabase versions, hash-based skipping, the secured cron route and `vercel.json` schedule, the archive pages. Done when: running ingest twice makes zero Gemini calls the second time, and a broken Gemini response leaves the old data live (both in `tests/ingest.test.ts`).
- **Phase 3, quest-log UI and launch.** The themed quest log, job, priority and playtime pickers, images, countdowns, mobile layout, empty and error states, metadata, deploy. Done when: on the production URL switching job re-groups items, the choice survives a reload, and the cron shows a successful run.
- **After launch.** Quests split from news; steps, claim windows and the `requires` link; the playtime planner; the grounding checks from the reviewer rounds; night mode; the feedback form; reward-icon matching; the Sunny Sunday panel; the Shroom icon and extras.
