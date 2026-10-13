# maple-lazy-tracker

Lazy Tracker tells Global MapleStory players what in the latest patch is worth their time. It reads the official patch notes and event notices, has Gemini sort each item into `must_do`, `if_free` or `skip` for three kinds of player and their daily playtime, and shows the result as an illustrated quest log.

See [SPEC.md](SPEC.md) for the architecture, data schema and build phases.

## Running locally

1. Install dependencies: `npm install`
2. Copy `.env.example` to `.env.local` and add a Gemini API key from https://aistudio.google.com/apikey
3. Start the dev server: `npm run dev`, then open http://localhost:3000

The page starts with sample data from `data/seed`. To fetch and classify the latest posts yourself, open http://localhost:3000/api/dev/ingest?limit=3 and repeat until nothing is reported as `deferred`. `limit` is the number of Gemini requests the run may spend; one request carries several posts. Results are saved under `.data/` and unchanged posts are skipped on later runs.

### Reading the ingest report

Each post gets a status:

| Status | Meaning |
|---|---|
| `unchanged` | Already up to date. No request spent |
| `classified` | Rated by a trusted model |
| `provisional` | Rated by a backup model because the trusted ones were out of quota. It is re-rated automatically on a later run |
| `unrated` | A new event listed without an AI rating, because no model could answer. Rated on a later run |
| `deferred` | Waiting: the request limit was reached, or no trusted model has quota left today |
| `failed` | An error. The previous version, if any, stays live |

The report ends with each model's use of today's quota. Gemini's free tier allows 20 requests per model per day. A model that refuses for the day is left alone until Google's documented reset, midnight Pacific time (07:00 or 08:00 UTC). The ledger behind that line is `.data/meta/gemini-quota.json`; delete it if you change keys or enable billing and want the models tried again at once.

## Tuning the prompt

The scheduled job only re-rates a post when it is new, its text changed, or `PROMPT_VERSION` in `lib/classifier/prompt.ts` moved on, and then it overwrites the live data. To judge a prompt edit first, use the prompt lab (development server only):

1. Edit `lib/classifier/prompt.ts`. Do not bump the version yet.
2. Open `/api/dev/try`. It runs the edited prompt on the posts behind today's quest list and saves the answer to `.data/trials/latest.json`. Nothing live changes. One request by default; event notices share it.
   - `?tier=fallback` uses the backup model, which has its own daily quota. Use it for rough first passes.
   - `?ids=45330,45393` picks posts. `?limit=2` allows more requests (patch notes need one each).
3. Open `/dev/review`. Every running quest is listed with the tier each kind of player gets and the model's raw score. An arrow shows the trial's value, and a yellow cell means the tier moved.
4. Happy with it? `/api/dev/try?promote` saves the trial as the live data without spending the requests again. Then bump `PROMPT_VERSION` so the posts the trial did not cover are re-rated on the next run.

## Having a player check the ratings

`.claude/agents/mapler.md` defines the Mapler, a reviewer agent for Claude Code. It reads `/dev/review`, opens the site as a Returning, a Casual and an Endgame player at 15 minutes, 30 minutes and 1 hour, and reports quests that are placed wrongly, with a player's reasoning and the kind of fix each needs. It does not edit code and does not spend Gemini requests. In Claude Code, with the dev server running, ask: "use the mapler agent to review the current quests".

## Useful URLs

| URL | What it gives you |
|---|---|
| `/api/status` | Health check: which store is in use, how many posts have a final rating, when the last run was, today's quota use |
| `/api/calendar` | The end dates of worthwhile quests as an `.ics` calendar file. Optional: `?profile=` one of `new`, `casual`, `endgame`, `returning`; `&priorities=progression,limited,cosmetic`; `&tier=` one of `must_do`, `worth`, `all` |
| `/sitemap.xml`, `/robots.txt` | For search engines |

## Deploying

1. Create a Supabase project and run `supabase/schema.sql` in its SQL editor.
2. Import this repository in Vercel and set the variables from `.env.example`, including `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and a long random `CRON_SECRET`.
3. Deploy. `vercel.json` schedules `/api/cron/ingest` once a day; run it once from the Vercel dashboard to fill the database.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the development server |
| `npm run lint` | Run ESLint |
| `npm test` | Run the unit tests (Vitest) |
| `npm run build` | Create a production build |

## Stack

Next.js (App Router) and TypeScript on Vercel, Supabase for the cache, Gemini via `@google/genai`.

This is a fan project and is not affiliated with Nexon.
