# maple-lazy-tracker

Lazy Tracker tells Global MapleStory players what in the latest patch is worth their time. It reads the official patch notes and event notices, has Gemini sort each item into `must_do`, `if_free` or `skip` for four player profiles, and shows the result as an illustrated quest log.

See [SPEC.md](SPEC.md) for the architecture, data schema and build phases.

## Running locally

1. Install dependencies: `npm install`
2. Copy `.env.example` to `.env.local` and add a Gemini API key from https://aistudio.google.com/apikey
3. Start the dev server: `npm run dev`, then open http://localhost:3000

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the development server |
| `npm run lint` | Run ESLint |
| `npm run build` | Create a production build |

## Stack

Next.js (App Router) and TypeScript on Vercel, Supabase for the cache, Gemini via `@google/genai`.

This is a fan project and is not affiliated with Nexon.
