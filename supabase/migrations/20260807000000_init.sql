-- Chronostudy phase 1 schema
-- Matches section 11 of the dev doc, with production-readiness additions
-- noted with comments below (Row Level Security, indexes, cascades, trigger).

-- ============================================================
-- profiles
-- Extends Supabase's built-in auth.users. One row per user.
-- ============================================================
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Student',
  daily_goal_minutes int not null default 60 check (daily_goal_minutes > 0),
  created_at timestamptz not null default now()
);

-- ============================================================
-- sessions
-- The single source of truth. Heatmap, stats, and badge progress
-- are all computed from this table via queries, not stored separately.
-- ============================================================
create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  session_date date not null,
  duration_seconds int not null check (duration_seconds >= 300), -- 5-minute minimum, section 4.0
  subject text,
  goal_minutes_at_time int not null,
  created_at timestamptz not null default now()
);

-- Speeds up the two most common queries: "this user's sessions for a
-- given day" (session log, heatmap day drill-down) and "sum this user's
-- time grouped by day" (heatmap, stats). Without this index, both queries
-- scan every session ever logged, for every user, every time.
create index sessions_user_date_idx on public.sessions (user_id, session_date);

-- ============================================================
-- badges
-- Reference data. Not tied to any one user.
-- ============================================================
create table public.badges (
  id text primary key,
  name text not null,
  threshold_minutes int not null check (threshold_minutes > 0),
  tier int not null
);

-- ============================================================
-- user_badges
-- Join table. Exists so the unlock animation only fires once per badge.
-- ============================================================
create table public.user_badges (
  user_id uuid not null references public.profiles(id) on delete cascade,
  badge_id text not null references public.badges(id) on delete cascade,
  unlocked_at timestamptz not null default now(),
  primary key (user_id, badge_id)
);

-- ============================================================
-- Row Level Security (RLS)
-- Without this, Supabase's auto-generated API exposes every table to
-- anyone who can call it — RLS is what restricts each user to only
-- their own rows. This is not optional for a real app.
-- ============================================================
alter table public.profiles enable row level security;
alter table public.sessions enable row level security;
alter table public.user_badges enable row level security;
-- badges is reference data, same for everyone — readable by anyone signed in,
-- writable by no one through the API (only via migrations, so no policy = no writes).
alter table public.badges enable row level security;

create policy "Users can view their own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can update their own profile"
  on public.profiles for update
  using (auth.uid() = id);

create policy "Users can view their own sessions"
  on public.sessions for select
  using (auth.uid() = user_id);

create policy "Users can insert their own sessions"
  on public.sessions for insert
  with check (auth.uid() = user_id);

create policy "Users can delete their own sessions"
  on public.sessions for delete
  using (auth.uid() = user_id);

create policy "Users can view their own badges"
  on public.user_badges for select
  using (auth.uid() = user_id);

create policy "Anyone signed in can view the badge list"
  on public.badges for select
  to authenticated
  using (true);

-- ============================================================
-- Auto-create a profile row when someone signs up
-- Without this, signup succeeds in auth.users but there's no matching
-- profiles row until the app manually creates one — an easy thing to
-- forget, and it would silently break onboarding (section 13) if missed.
-- ============================================================
create function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id)
  values (new.id);
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
