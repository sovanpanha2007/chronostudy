# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Critical: Next.js version mismatch with training data

This project runs **Next.js 16.2.12**, a major version released after this model's knowledge cutoff. APIs,
conventions, and file structure may differ from what you expect. Before writing or editing any Next.js code
(routing, data fetching, config, metadata, etc.), consult `node_modules/next/dist/docs/` — it mirrors the
official docs for the exact installed version:

- `01-getting-started/`
- `02-guides/`
- `03-api-reference/`
- `04-glossary.md`

Do not assume App Router/Pages Router behavior from prior Next.js versions without checking these docs first.

## Commands

- `npm run dev` — start the dev server (http://localhost:3000)
- `npm run build` — production build
- `npm run start` — serve the production build
- `npm run lint` — run ESLint (flat config via `eslint.config.mjs`)

There is no test runner configured in this project yet.

## Architecture

- **App Router** app in `src/app`, path-aliased as `@/*` → `./src/*` (see `tsconfig.json`).
- Currently just the default `create-next-app` scaffold: `src/app/layout.tsx` (root layout, Geist fonts) and
  `src/app/page.tsx` (home page). No custom routes, components, or data layer exist yet.
- **Styling**: Tailwind CSS v4 via `@tailwindcss/postcss`, configured through the `@theme inline` block in
  `src/app/globals.css` (no separate `tailwind.config.*`). Light/dark theme uses CSS variables
  (`--background`/`--foreground`) toggled by `prefers-color-scheme`.
- **Supabase**: `@supabase/supabase-js` and `@supabase/ssr` are installed and `.env.local` has
  `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` configured, but no Supabase client code
  exists in `src/` yet — this is wired up but unused so far.
