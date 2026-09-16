-- Chronostudy phase 1 — schema fixes and additions
-- See docs/SPEC.md section 1. The init migration is not edited because it is
-- already applied to the hosted project.

-- ============================================================
-- 1. Onboarding gate
-- The signup trigger creates a profiles row with defaults ('Student', 60),
-- which makes a brand-new user indistinguishable from one who finished
-- onboarding and picked the recommended 1hr goal. NULL = show onboarding.
-- Doubles as the baseline for the activation metric (plan section 8.5).
-- ============================================================
alter table public.profiles add column onboarded_at timestamptz;

-- ============================================================
-- 2. Authoritative per-user clock
-- IANA zone name, not a UTC offset: offsets break across DST and would be
-- wrong twice a year for most of the world. Captured at signup from
-- Intl.DateTimeFormat().resolvedOptions().timeZone, editable in settings.
-- ============================================================
alter table public.profiles add column timezone text not null default 'UTC';

-- ============================================================
-- 3. Sessions UPDATE policy
-- The timer INSERTs one row at the 5-minute mark, then UPDATEs its duration
-- every 45s. The init migration granted select/insert/delete but no update,
-- so every autosave after the first would have failed silently.
-- ============================================================
create policy "Users can update their own sessions"
  on public.sessions for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ============================================================
-- 4. Badge unlock policy, threshold-guarded
-- Badge unlocks are detected and inserted client-side so the animation can
-- fire at the right moment. Postgres independently re-verifies that the
-- cumulative time was actually earned, so a user cannot grant themselves a
-- badge — which starts to matter once the phase 2 friends leaderboard makes
-- badges visible to other people.
-- ============================================================
create policy "Users can unlock badges they have earned"
  on public.user_badges for insert
  with check (
    auth.uid() = user_id
    and (
      select coalesce(sum(duration_seconds), 0) / 60
      from public.sessions where user_id = auth.uid()
    ) >= (select threshold_minutes from public.badges where id = badge_id)
  );

-- ============================================================
-- 5. Daily aggregation view
-- SUM and the weighted goal-fraction run in Postgres; TypeScript maps the
-- fraction to a colour level so the ramp can be tuned without a migration.
-- Each session counts against the goal in force when it was saved, so a
-- later goal change never repaints past cells.
--
-- security_invoker is required. Without it the view executes as its owner
-- and bypasses RLS entirely, exposing every user's totals to every user.
-- ============================================================
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

-- ============================================================
-- 6. Badge ladder seed
-- The badges table shipped with a read policy but zero rows. Eight tiers,
-- with the first reachable inside day one so a new user meets the mechanic
-- immediately rather than a week later.
-- ============================================================
insert into public.badges (id, name, threshold_minutes, tier) values
  ('first-hour',      'First Hour',      60,    1),
  ('getting-started', 'Getting Started', 300,   2),
  ('committed',       'Committed',       600,   3),
  ('serious',         'Serious',         1500,  4),
  ('dedicated',       'Dedicated',       3000,  5),
  ('centurion',       'Centurion',       6000,  6),
  ('scholar',         'Scholar',         15000, 7),
  ('master',          'Master',          30000, 8);

-- ============================================================
-- 7. Table grants
-- RLS narrows what a role may reach; it does not grant access in the first
-- place. Migrations run as `postgres`, and that role's default privileges in
-- `public` hand anon/authenticated only Dxtm (truncate, references, trigger,
-- maintain) — no select/insert/update/delete. Without these grants every
-- PostgREST query from a signed-in user fails with "permission denied for
-- table", regardless of how correct the policies are.
--
-- Granted per policy, not blanket: `authenticated` gets exactly the verbs the
-- policies above allow, and `anon` gets nothing, since no unauthenticated page
-- reads these tables.
-- ============================================================
grant select, update          on public.profiles     to authenticated;
grant select, insert, update, delete
                              on public.sessions     to authenticated;
grant select                  on public.badges       to authenticated;
grant select, insert          on public.user_badges  to authenticated;
grant select                  on public.daily_totals to authenticated;
