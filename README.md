# Chronostudy

A study timer with session recovery, daily goals, a heatmap, and earned badges.
Built with Next.js App Router and Supabase. Live: https://chronostudy-tan.vercel.app.

## Development

1. Install dependencies with `npm ci`.
2. Start Docker Desktop, then run `npx supabase start`.
3. Apply local migrations with `npx supabase migration up --local`.
4. Copy `.env.example` to `.env.local` and fill in the local public API key from
   `npx supabase status`. Keep credentials out of Git.
5. Run `npm run dev` and open http://localhost:3000.

## Organization

```text
src/
  app/                  # Routes, server page shells, layouts, auth callbacks
  components/
    auth/               # Login and onboarding screens
    study/              # Timer, heatmap, sessions, settings, study screen
    ui/                 # Reusable UI primitives
    Brand.tsx           # Shared application branding
  lib/
    supabase/           # Browser, server, and proxy Supabase adapters
    *.ts                # Domain logic, shared types, server auth, HTTP helpers
    *.test.ts           # Unit tests beside the logic they exercise
  proxy.ts              # Next.js request proxy and session refresh
tests/                  # Auth boundary and SQL integration tests
supabase/
  config.toml           # Local Supabase configuration
  migrations/           # Ordered, immutable database migrations
public/                 # Public static assets; never secrets
docs/                   # Product spec, test guide, deployment and security review
```

Keep route files small. Components may use shared `lib` modules; domain modules
must not import UI components. Use `@/` for imports across folders, and relative
imports within a folder. Keep server-only logic marked with `import 'server-only'`.
New database changes belong in new migrations; never edit an applied migration.

## Checks and deployment

Run `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build`.
See [testing](docs/TESTING.md), [deployment](docs/DEPLOYMENT.md),
[security review](docs/SECURITY.md), and the [product specification](docs/SPEC.md).
`.vercelignore` excludes local configuration, database files, and tests from uploads.
