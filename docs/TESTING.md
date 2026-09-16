# Phase 1: run and verify

The app follows the stages in `SPEC.md`: foundation and schema → auth and
onboarding → timer, saves, heatmap and log → badges and feedback → polish.
Streaks, leaderboard, monetization and PWA installation remain deferred.

Verified on 2026-09-17: 62 automated tests; lint, TypeScript and production
build; all five migrations recorded on hosted Supabase. The 2026-09-16 local Chromium walkthrough covered
email confirmation, onboarding, short-session discard, five-minute checkpoints,
multiple offline completions, reload recovery, tab locking, settings, day history,
deletion, sign-out, 375px layout, and reduced motion. A disposable local recovery
snapshot also verified goal/badge celebrations, no award replay after reload,
and badge retention after deleting a session. Production is live at
https://chronostudy-tan.vercel.app. Hosted transaction checks verified onboarding,
saves, badge awards, retries, deletion and permissions, then rolled back all test
data. A public Chromium check verified the signed-out redirect and Google button
reaching Google's sign-in page with the production callback. The user confirmed
actual Google account sign-in works. The live session walkthrough remains a
recommended acceptance check; custom SMTP for public email signup is not
configured. See `DEPLOYMENT.md`.

Security review browser checks also verify anti-framing/MIME/referrer headers,
private auth responses, invalid callback handling, and the production Google
redirect. Integration tests live in `tests/`; domain unit tests stay beside the
corresponding `src/lib` modules. See `SECURITY.md` for review scope and limitations.

## Fast automated check

```sh
npm install
npm run lint
npm run typecheck
npm test
npm run build
```

Tests cover timer timing, recovery and storage failures, account-scoped queues,
date boundaries, heatmap levels, optimistic totals, and the actual SQL migrations
and database functions. SQL tests use an isolated in-memory PostgreSQL instance
(PGlite), with a minimal Supabase Auth schema and request identity. They never
touch your local or hosted study records. They do not replace checking actual
Supabase Auth, OAuth providers or concurrent requests against Supabase.

## Run locally

1. Start Docker Desktop, then run `npx supabase start`.
2. Apply pending migrations with `npx supabase migration up --local`.
   Use `npx supabase db reset --local` only for a disposable database: it deletes
   local records. Do not modify already-applied migrations.
3. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   in `.env.local` using your local Supabase URL and publishable/anon key.
   Never use a service-role or secret key in a `NEXT_PUBLIC_` variable.
4. Run `npm run dev` and open <http://localhost:3000>.
5. Create an email account and follow the confirmation email in local Mailpit
   (the inbox URL is shown by Supabase). Complete the six onboarding screens.

## Efficient manual check (about 7 minutes)

| Check | Expected result |
| --- | --- |
| Open `/app` while signed out | Redirect to login. |
| Complete onboarding, skipping the name | Generated name; timer ready; recommended goal is 1 hour. |
| Start, pause, wait a few seconds, resume | Paused time is excluded. No cloud save before five confirmed minutes. |
| Reload during the first minute | Same session returns paused; include/exclude the time away explicitly. |
| Open another app tab | Only one tab controls the timer. Close its tab to allow takeover. |
| At five minutes, inspect Network | One `save_study_session` request; heatmap and totals update. |
| Set Network offline, finish, then reconnect | “Saved on this device” status, then one finalized session with accurate totals. Keep the page open while offline: offline page loading is not a Phase 1 feature. |
| Start and immediately finish another session | No saved row or “too short” message. |
| Change the goal/timezone in Settings | Existing session dates and goal colors remain unchanged. |
| Tap today’s square; delete the completed session | Session removed from totals and heatmap; earned badges remain. |
| Use a 375px viewport and reduced motion | No page overflow; heatmap scrolls to today; dialogs and controls remain usable. |

The automated tests cover longer waits without spending hours: presence checks,
multiple badge thresholds, stale/duplicate saves, goal color boundaries, midnight,
DST, and offline recovery. To see goal and badge celebrations live, complete
enough study time to reach your selected goal and the first 60-minute badge.

## Hosted launch requirements

- Apply the reviewed migrations to the intended hosted project before deploying.
- Enable email confirmations. Allow the deployed `/auth/callback` URL in Auth
  redirect settings; use the correct production site URL.
- Enable Google in Supabase Auth with your OAuth client credentials. Register
  Supabase’s provider callback in Google and test email + Google with the same
  verified email: it must return the same account and study history.
- For local Google testing, configure an `[auth.external.google]` provider with
  credentials from environment variables; no credentials are committed here.
- Use the standard confirmation-link template with the signup redirect to
  `/auth/callback`, or a token-hash email template targeting `/auth/confirm`.
- Set the two public Supabase variables on the deployment and repeat the short
  manual check there. Google configuration and hosted deployment are separate
  from passing local build and database checks.
