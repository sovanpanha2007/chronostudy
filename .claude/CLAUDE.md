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
- `npx supabase start` / `npx supabase db reset` — run the local Supabase stack and (re)apply migrations under
  `supabase/migrations/` (project ref `chronostudy`, config in `supabase/config.toml`). The `supabase` CLI is a
  devDependency.

There is no test runner configured in this project yet.

## Product context

- `docs/study-log-project-plan.md` is the living product/design spec — problem statement, feature mechanics,
  phase 1 vs. phase 2 scope, data model, onboarding flow, and build sequence. Check it before making product or
  schema decisions; it is the source of truth the code below is being built against, not the other way around.
- `docs/diagrams/` has the ERD and session-save sequence diagram (standalone HTML) referenced by that plan.
- Phase 1 (current target) is a web app: Timer → session save → heatmap → badges → immediate feedback. Streak
  and the friends leaderboard are explicitly deferred to phase 2 (mobile) — don't build them prematurely.

## Architecture

- **App Router** app in `src/app`, path-aliased as `@/*` → `./src/*` (see `tsconfig.json`).
- Still the default `create-next-app` scaffold: `src/app/layout.tsx` (root layout, Geist fonts) and
  `src/app/page.tsx` (home page, unedited placeholder content). No custom routes, components, or data-fetching
  code exist in `src/` yet, despite the backend below being real.
- **Styling**: Tailwind CSS v4 via `@tailwindcss/postcss`, configured through the `@theme inline` block in
  `src/app/globals.css` (no separate `tailwind.config.*`). Light/dark theme uses CSS variables
  (`--background`/`--foreground`) toggled by `prefers-color-scheme`.
- **Supabase — schema is live, app integration is not:**
  - `supabase/migrations/20260807000000_init.sql` defines the phase 1 schema from the project plan's data model section:
    `profiles` (extends `auth.users`), `sessions` (single source of truth — heatmap/stats/badges are computed
    from it via queries, nothing is stored redundantly), `badges` (reference data), `user_badges` (join table
    gating the unlock animation to once per badge). RLS is enabled on every table, scoped to `auth.uid()`, and
    a trigger auto-creates a `profiles` row on signup.
  - Client helpers live at `utils/supabase/{client,server,middleware}.ts` (browser / server-component-or-route
    / middleware clients, per the `@supabase/ssr` pattern). **`utils/` sits outside `src/`**, so it is *not*
    covered by the `@/*` alias — import from it with a relative path, or move it under `src/` if you want the
    alias to apply.
  - Nothing in `src/` calls any of these clients yet, and there is no root `middleware.ts` wiring up the
    middleware client — auth/session refresh is not actually running. Treat Supabase as configured-but-unwired
    when asked to build features that need it.
  - Env vars: `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in `.env.local`.
