# Chronostudy — Phase 1 Implementation Spec

**Status**: ready to build · **Date**: 2026-08-14
**Companion to**: `docs/study-log-project-plan.md` (product/design source of truth)

This document is the *engineering* spec. Where the project plan says what to build and why, this says
how — with every ambiguity the plan left open resolved into a decision. Where a decision here departs
from or extends the plan, it is marked **[extends plan]** with the reasoning.

Scope is phase 1 only: auth → onboarding → timer → session save → heatmap → stats → session log →
badges → feedback. Streak, leaderboard, notifications, and widgets remain phase 2.

---

## 0. Repo corrections (do these first)

Three defects in the current repo, found while writing this spec. All are blockers.

### 0.1 The migration was in the wrong directory — **fixed 2026-08-14**

`20260807000000_init.sql` sat at the root of `supabase/`. The Supabase CLI only applies files in
`supabase/migrations/`, so `npx supabase db reset` applied **nothing** — the local database had no
tables at all. The file now lives at `supabase/migrations/20260807000000_init.sql`.

### 0.2 Next.js 16 renamed `middleware.ts` to `proxy.ts`

Per `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md`:

> The `middleware` file convention is deprecated and has been renamed to `proxy`.

Every Supabase SSR tutorial online still says `middleware.ts`. Following them here produces a file
Next 16 does not load, and session refresh silently never runs — the exact failure the repo's
`CLAUDE.md` version-gap warning exists to prevent. Create **`src/proxy.ts`**, exporting a function
named `proxy` (or a default export).

The Next 16 auth guide also constrains what belongs there:

> since Proxy runs on every route, including prefetched routes, it's important to only read the
> session from the cookie (optimistic checks), and avoid database checks to prevent performance
> issues.

So proxy does cookie-based session refresh and unauthenticated redirects **only**. The
`onboarded_at` check (§7.2) is a database read and therefore belongs in the `/app` server component,
not in proxy.

### 0.3 The middleware helper never refreshes the session

`utils/supabase/middleware.ts` builds a Supabase client, never calls it, and returns only the
response. The `@supabase/ssr` pattern requires calling `supabase.auth.getUser()` inside the
proxy — that call is what triggers the token refresh and writes refreshed cookies via `setAll`.
Without it the helper is decorative.

**Fix**: call `await supabase.auth.getUser()` before returning, and return `{ supabase, response, user }`
so `proxy.ts` can make redirect decisions from the same call.

### 0.4 Module location

`utils/` sits outside `src/`, so the `@/*` path alias (`./src/*`) does not cover it.

**Fix**: move `utils/supabase/` → `src/lib/supabase/`, import as `@/lib/supabase/{client,server,proxy}`.

---

## 1. Schema changes

One new migration, `supabase/migrations/20260814000000_phase1_fixes.sql`. The init migration is not
edited — it is already applied to the hosted project.

```sql
-- 1. Onboarding gate. The signup trigger creates a profiles row with defaults
--    ('Student', 60), making a brand-new user indistinguishable from one who
--    finished onboarding and picked the recommended 1hr goal. NULL = show onboarding.
alter table public.profiles add column onboarded_at timestamptz;

-- 2. Authoritative per-user clock. IANA zone name, not a UTC offset (offsets
--    break across DST). Captured at signup, editable in settings.
alter table public.profiles add column timezone text not null default 'UTC';

-- 3. The timer INSERTs at the 5-minute mark then UPDATEs every 30-60s.
--    The init migration has no UPDATE policy, so every autosave after the
--    first would silently fail.
create policy "Users can update their own sessions"
  on public.sessions for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 4. Badge unlocks are detected and inserted client-side. Postgres independently
--    verifies the threshold was actually earned, so a user cannot grant
--    themselves a badge — which matters once the phase 2 friends leaderboard
--    makes badges publicly visible.
create policy "Users can unlock badges they have earned"
  on public.user_badges for insert
  with check (
    auth.uid() = user_id
    and (
      select coalesce(sum(duration_seconds), 0) / 60
      from public.sessions where user_id = auth.uid()
    ) >= (select threshold_minutes from public.badges where id = badge_id)
  );

-- 5. Daily aggregation. SUM and the weighted goal-fraction run in Postgres;
--    TypeScript maps fraction -> color level. Views inherit RLS from the
--    underlying table, so this is per-user safe.
create view public.daily_totals
with (security_invoker = true) as
  select
    user_id,
    session_date,
    sum(duration_seconds) as total_seconds,
    sum(duration_seconds::numeric / (goal_minutes_at_time * 60)) as goal_fraction,
    count(*) as session_count
  from public.sessions
  group by user_id, session_date;

-- 6. Badge ladder seed. The badges table has a read policy but zero rows.
insert into public.badges (id, name, threshold_minutes, tier) values
  ('first-hour',      'First Hour',      60,    1),
  ('getting-started', 'Getting Started', 300,   2),
  ('committed',       'Committed',       600,   3),
  ('serious',         'Serious',         1500,  4),
  ('dedicated',       'Dedicated',       3000,  5),
  ('centurion',       'Centurion',       6000,  6),
  ('scholar',         'Scholar',         15000, 7),
  ('master',          'Master',          30000, 8);
```

`security_invoker = true` on the view is required — without it the view runs as its owner and
bypasses RLS, exposing every user's daily totals to every other user.

---

## 2. Timer & session lifecycle

The hardest part of the build. Everything below is client-side state in a `<Timer>` client
component, writing directly to Supabase (§6).

### 2.1 Elapsed time is accumulated from timestamp deltas, never from tick counts

Counting `setInterval` firings is wrong twice over: intervals drift, and browsers throttle
background tabs to roughly one tick per minute. A user who tabs away to their reading material —
the normal case for a study timer — would watch their time stop counting.

```
state: { startedAt, accumulatedMs, lastTickAt, status }
status: 'idle' | 'running' | 'paused' | 'checking-presence'

on tick (every 250ms while running):
  delta = now - lastTickAt
  if delta > SLEEP_GAP_MS:        // 120_000
      -> do NOT add delta
      -> status = 'checking-presence'   (see 2.3)
  else:
      accumulatedMs += delta
  lastTickAt = now

display = floor(accumulatedMs / 1000)
```

Accumulating real deltas means a throttled 60-second background tick correctly adds 60 seconds.
`SLEEP_GAP_MS = 120s` sits deliberately above the ~60s background-throttle floor, so ordinary
tabbing away never trips it, while a slept laptop or frozen tab always does.

**The tab being hidden does not pause the timer.** Studying happens away from the screen. No idle or
foreground detection — §4.5 of the plan rules it out for v1.

### 2.2 Write schedule

| Moment | Action |
|---|---|
| `accumulatedMs` first reaches 300s (5 min) | `INSERT` the sessions row |
| every 45s thereafter while running | `UPDATE duration_seconds` |
| pause | one final `UPDATE`, then stop writing |
| resume | continue writing to the **same row** |
| stop | final `UPDATE`, then badge check (§5) |
| stop before 5:00 | nothing was ever written — discard silently, no message |

The 5-minute minimum is enforced by simply not inserting, which matches the existing
`check (duration_seconds >= 300)` constraint rather than fighting it.

A crashed session leaves an open row holding whatever the last autosave wrote. **This is accepted
and unmarked** — no `ended_at`, no status column, no cleanup job. A crashed session is just a
slightly short session; the time in it was really studied. Worst case loses under 45 seconds.

### 2.3 Presence check — "Are you still there?"

Replaces a hard session cap. A hard cap either clips legitimate long sessions or lets a closed
laptop lid write a 9-hour lie into a record whose entire value is being trustworthy.

Two independent triggers put the timer into `checking-presence`, which **auto-pauses immediately**
(freezing `accumulatedMs`, writing one final `UPDATE`) and shows a modal:

1. **Sleep gap** — a tick delta over 120s (§2.1). Catches the closed lid, the discarded tab, the
   suspended machine. This is the trigger that actually does the work, because a frozen tab cannot
   run a timer to notice anything else.
2. **Long session** — `accumulatedMs` crosses `(daily_goal_minutes + 120) * 60_000`. Scales with the
   user's own goal, so the 4hr-goal preset is never blocked from reaching 100%. Re-arms every 2h
   after a confirmation.

Modal copy is encouraging, not accusatory (§6 design values): *"Still studying? Your timer's paused
at 2h 14m."* → **[Keep going]** resumes in place · **[Finish here]** stops and saves.

Dismissing or ignoring the modal leaves the session paused indefinitely — harmless, since a paused
row is already saved at its last honest value.

### 2.4 Pause semantics

Pause freezes accrual; paused wall-clock time never counts. The row stays open and resume continues
writing to it, so a pause never fragments one study block into two log entries.

### 2.5 Offline behavior

The timer is local and keeps running regardless of network. On a failed write:

- Buffer `{ rowId | null, startedAt, accumulatedMs, sessionDate, goalMinutes, subject }` to
  `localStorage['chronostudy:pending']`.
- Retry on the next 45s tick and on the `window.online` event.
- If `rowId` is null the INSERT never landed — retry as an INSERT with the buffered elapsed value.
- Show a quiet inline indicator: *"Offline — saved on this device."* Not a blocking error.
- Flush any leftover buffer on next app load.

### 2.6 Subject

Optional free-text input beside the timer, with autocomplete from the user's distinct past subjects
(`select distinct subject from sessions where user_id = auth.uid() and subject is not null`). Type
it once, then it's a one-tap chip forever after. Never required; NULL is valid.

---

## 3. Time zones and `session_date`

**One clock, stored, never inferred.** GitHub's contribution graph infers a timezone per event — the
commit's author-date offset for commits, the browser's zone for web actions — while its docs say
contributions are timestamped in UTC. Both are partly true, users cannot tell which applies to them,
and "my commit landed on the wrong square" is a perennial support thread. Do not reproduce this.

- `profiles.timezone` holds an IANA zone name, captured at signup via
  `Intl.DateTimeFormat().resolvedOptions().timeZone`, editable in settings.
- **A session counts toward the local date on which it started** — the day the user began, not the
  day they finished. A 23:40 → 00:20 session belongs entirely to the earlier day.
- `session_date` is computed once, at INSERT, from `startedAt` in the profile's stored zone — not
  the browser's current zone, so travel or a mis-set second device cannot split a day.

```ts
// 'en-CA' formats as YYYY-MM-DD, which is exactly the Postgres date literal.
export function resolveSessionDate(startedAt: number, timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date(startedAt));
}
```

Sessions are never re-dated if the user later changes their timezone. Past cells are permanent.

---

## 4. Heatmap

### 4.1 Color model — deliberately *not* GitHub's

GitHub splits your last 365 days into quartiles relative to your own busiest day. A new record day
becomes the darkest and **every other cell in the graph gets lighter**; when the busiest day rolls
off the window, cells darken again. GitHub does this because it has no idea what "enough" means for
you.

Chronostudy does: `daily_goal_minutes`. So the scale is fixed and goal-relative, which buys a
property GitHub's design cannot have — **a past cell never silently changes color.** That is also
precisely why `sessions.goal_minutes_at_time` exists.

### 4.2 Per-day fraction

Each session contributes against the goal that was in force when *it* was saved, summed per day:

```
goal_fraction = Σ (duration_seconds / (goal_minutes_at_time × 60))
```

So 30 min at a 60-min goal plus 30 min after raising the goal to 120 gives `0.5 + 0.25 = 0.75`.
Computed by the `daily_totals` view (§1).

### 4.3 Levels — capped at goal

```ts
export function goalFractionToLevel(f: number): 0|1|2|3|4|5 {
  if (f <= 0)    return 0;
  if (f < 0.25)  return 1;
  if (f < 0.5)   return 2;
  if (f < 0.75)  return 3;
  if (f < 1.0)   return 4;
  return 5;                  // >= 100% of goal, capped
}
```

Six steps including empty, matching the plan's "5–6 visible levels". **Capped at darkest**: hitting
the goal is the single most important signal in the design, so it must be visually unambiguous — a
3x day and a 1x day look the same in the grid. The real total (`3h 12m — 320% of goal`) appears in
the day drill-down, so the achievement stays discoverable without diluting the grid.

### 4.4 Layout

53 weeks × 7 rows, one cell per day, days as rows and weeks as columns.

**Mobile**: the grid keeps its full 365 days inside an `overflow-x: auto` container, auto-scrolled
to the current week on mount. Cells stay large enough to tap, since the day drill-down depends on
tapping one. This is GitHub's own mobile answer, and it preserves the year-long record that is the
entire pitch — a responsive 12-week window would hide it from exactly the users most likely to be on
a phone.

Clicking a day opens that day's session breakdown, which is the only route to history older than a
week (§5.2 of the plan).

---

## 5. Badges

Cumulative lifetime minutes, `sum(duration_seconds) / 60` across all sessions. Eight tiers (§1),
with the first reachable inside day one so a new user meets the mechanic immediately.

Detection runs **client-side after a session is saved**:

```ts
export function detectNewBadges(totalMinutes: number, unlocked: Set<string>, ladder: Badge[]): Badge[] {
  return ladder.filter(b => b.threshold_minutes <= totalMinutes && !unlocked.has(b.id));
}
```

Newly detected badges are inserted into `user_badges`; the RLS policy from §1 independently
re-verifies each threshold against the sessions table, so the client is trusted for *timing* but
never for *truth*. The `user_badges` row is what gates the unlock animation to once per badge, per
the plan.

Detection fires **on stop only**, never mid-session — interrupting an active study session with a
celebration animation would be hostile to the thing the app exists to protect.

**Deleting a session never revokes a badge.** [extends plan] Once celebrated, it stays. Un-awarding
something contradicts §6's "rooting for the user," and the alternative — animation state that can run
backwards — is worse to build than to live with.

---

## 6. Architecture

### 6.1 RSC reads, client writes

- **Reads**: Server Components fetch profile, `daily_totals`, recent sessions, and unlocked badges
  on load via the server client. Fast first paint, heatmap is server-rendered.
- **Writes**: the `<Timer>` client component writes directly through the browser client on its
  30–60s tick. RLS enforces ownership; no API layer to build or keep in sync.
- After stop, call `router.refresh()` to re-pull server data, with the heatmap cell updated
  optimistically first so feedback is instant.

### 6.2 Routes

| Route | Rendering | Purpose |
|---|---|---|
| `/` | server | Redirects: no session → `/login`; `onboarded_at` null → `/onboarding`; else `/app` |
| `/login` | client | Email/password + Google |
| `/auth/callback` | route handler | OAuth code exchange |
| `/auth/confirm` | route handler | Email confirmation |
| `/onboarding` | client | 6 screens, local step state, one route |
| `/app` | server shell + client islands | The single scrolling page |

`/app` is one scrolling page per §10 of the plan: top bar (nickname · current badge · settings) →
timer → stats row → heatmap → recent sessions.

### 6.3 Files

```
src/
  proxy.ts                   # NOT middleware.ts — Next 16 rename (§0.2)
  lib/
    supabase/{client,server,proxy}.ts    # moved from utils/, now under @/*
    time.ts                  # resolveSessionDate, formatDuration, elapsed math
    heatmap.ts               # goalFractionToLevel, calendar grid builder
    badges.ts                # detectNewBadges, ladder types
  app/
    layout.tsx  globals.css  page.tsx
    login/  onboarding/  app/  auth/
  components/
    Timer.tsx  Heatmap.tsx  StatsRow.tsx  SessionLog.tsx
    PresenceCheckModal.tsx  BadgeUnlock.tsx  SettingsModal.tsx
```

---

## 7. Auth & onboarding

### 7.1 Providers

Email/password and Google, with **automatic identity linking on verified email** so one address is
one account regardless of provider. This requires email confirmation to be enabled on password
signup — an accepted extra step, because the alternative produces the worst possible support ticket
in an app whose value is a permanent record: *"I signed in with Google and my whole year is gone."*

Note `supabase/config.toml` currently has `enable_manual_linking = false`; automatic linking is
separate and configured in the hosted project's auth settings. Verify both local and hosted config.

### 7.2 The onboarding gate

`profiles.onboarded_at` is NULL until screen 6 completes. Because this is a database read, it
**cannot** live in `proxy.ts` (§0.2) — proxy handles only the cookie-level "is there a session"
check, and `/` plus `/app` server components handle the onboarded check.

Six screens per §13 of the plan, unchanged: Welcome → purpose → starting point → goal → name
(skippable) → transition. Progress dots on 2–5. "1 hr" pre-marked Recommended.

Writes on completion: `daily_goal_minutes` (screen 4), `display_name` (screen 5, auto-generated
placeholder if skipped), `timezone` (captured silently), `onboarded_at = now()`. Screens 2–3 shape
copy only and are not stored, per the plan.

`onboarded_at` doubles as the baseline for the §8.5 success metric — activation time is
`first_session_at − onboarded_at`, free.

---

## 8. Feedback tiers

Three tiers, scaled so reward size matches rarity (§4.4 of the plan). Motion (`motion/react`), with
`useReducedMotion` respected on all three — reduced motion gets the state change without the
movement, never a missing state change.

1. **Every save** — the heatmap cell fills/deepens immediately; today's and lifetime totals tick up.
2. **Daily goal met** — distinct "goal complete" animation, fires at most once per day. Tracked by
   the day's `goal_fraction` crossing 1.0 as a result of *this* save.
3. **Badge unlock** — full unlock animation, gated to once per badge by `user_badges`.

The heatmap is phase 1's de facto streak signal; an unbroken run of filled cells supplies the
"don't leave a gap" pull without any of the streak/passes/timezone machinery.

---

## 9. Theme

**Dark-only, amber accent.** One committed look, one palette to tune, and the goal-relative gradient
reads best against dark. `globals.css` currently ships the unmodified `create-next-app`
light/dark scaffold — replace it.

- Set `color-scheme: dark`, drop the `prefers-color-scheme` block.
- Warm near-black ground (`#0b0a09`), warm surface (`#1a1613`), warm off-white text (`#f5f0e8`).
- Heatmap ramp, level 0→5: `#1c1917` · `#451a03` · `#78350f` · `#b45309` · `#f59e0b` · `#fbbf24`,
  with a soft glow on level 5 so hitting the goal is unmistakable.
- All colors as CSS variables in the `@theme inline` block — no hardcoded hex in components.

---

## 10. Testing

Vitest, unit tests on pure logic only. No component or E2E tests; this is a solo pre-launch build
and manual QA covers the flows. The functions below are tested because a bug in them is **silent and
permanent** — it corrupts a record the user cannot reconstruct:

- `resolveSessionDate(startedAt, tz)` — including the 23:40→00:20 midnight case and a DST boundary
- `goalFractionToLevel(f)` — boundaries at 0, 0.25, 0.75, 0.999, 1.0, 3.0
- `detectNewBadges(total, unlocked, ladder)` — including crossing two tiers in one session
- elapsed accumulation — a >120s delta must not be added, a 60s throttled delta must be

---

## 11. Build sequence

**Stage 0 — corrections** (§0): ~~move the migration~~ (done), move `utils/` → `src/lib/`, write
`src/proxy.ts`, fix the session-refresh helper. Verify `npx supabase db reset` creates tables.

**Stage 1 — schema**: the phase-1-fixes migration (§1). Confirm the badge seed landed and that
`daily_totals` returns only your own rows when queried as a second user.

**Stage 2 — auth & onboarding**: providers + linking, `/login`, callbacks, the 6 screens, the
`onboarded_at` gate.

**Stage 3 — core loop**: `<Timer>` (radial dial) with the §2 state machine → session save → heatmap
→ stats row → session log with delete.

**Stage 4 — retention**: badge detection + display, the three feedback tiers.

**Stage 5 — polish**: settings modal (goal, name, timezone), amber theme pass, mobile heatmap scroll,
reduced-motion check, deploy.

---

## 12. Verification

- `npx supabase db reset` → tables exist, 8 badge rows present.
- Sign up with email, then Google, same address → **one** account, one heatmap.
- Start timer, stop at 4:59 → no row. Stop at 5:01 → one row.
- Start timer, watch the network tab → INSERT at 5:00, UPDATE every ~45s.
- Devtools offline → timer keeps running, indicator appears, buffer flushes on reconnect.
- Set system clock to 23:50, run a session past midnight → lands on the *earlier* day's cell.
- Sleep the laptop mid-session, reopen → presence modal, elapsed did **not** jump.
- Set goal to 30 min, study 30 min → level 5 cell + goal-met animation. Study 90 more → still level 5.
- Study 60 min total → `first-hour` badge unlock animation, exactly once (reload, no replay).
- In SQL, try inserting a `master` badge for yourself directly → RLS rejects it.
- Load `/app` on a 375px viewport → heatmap scrolled to today, cells tappable.
- `npm run lint` and `npx vitest run` clean.

---

## 13. Deferred / open

- **Deferred by the plan, unchanged**: streak + passes, friends leaderboard, push, widget, manual
  backfill, per-subject heatmap, summary views, export, Pomodoro, anti-cheat.
- **PWA**: not in phase 1 — plain responsive web app. Nothing in the feature list requires
  installability; revisit after the loop is validated.
- **Session editing**: delete only, no duration editing. Revisit if capped/runaway sessions turn out
  to be common in practice.
- **Trademark**: USPTO + app-store name check on "Chronostudy" still outstanding (§ plan intro).
- **Monetization**: ad placement and referral structure remain unspecified, post-launch.
</content>
