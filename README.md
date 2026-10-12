# maple-lazy-tracker

Lazy Tracker tells Global MapleStory players what in the latest patch is worth their time. It reads the official patch notes and event notices, has Gemini sort each item into `must_do`, `if_free` or `skip` for four player profiles, and shows the result as an illustrated quest log.

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

The report ends with each model's use of today's quota. Gemini's free tier allows 20 requests per model per day, resetting at midnight Pacific time. The ledger behind that line is `.data/meta/gemini-quota.json`; delete it if you change keys or enable billing and want the models tried again at once.

## Useful URLs

| URL | What it gives you |
|---|---|
| `/api/status` | Health check: which store is in use, how many posts have a final rating, when the last run was, today's quota use |
| `/api/calendar` | The end dates of worthwhile quests as an `.ics` calendar file. Optional: `?profile=new|casual|endgame|returning`, `&priorities=progression,limited,cosmetic`, `&tier=must_do|worth|all` |
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
