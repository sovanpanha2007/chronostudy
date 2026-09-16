-- All session writes go through authenticated functions. Keep old migrations intact.
alter table public.sessions
  add column started_at timestamptz,
  add column timezone text not null default 'UTC',
  add column revision bigint not null default 1 check (revision > 0),
  add column finalized_at timestamptz,
  add column deleted_at timestamptz,
  add column awarded_badges jsonb not null default '[]'::jsonb,
  add constraint sessions_positive_goal check (goal_minutes_at_time > 0);

update public.sessions set started_at = created_at, finalized_at = created_at;
alter table public.sessions alter column started_at set not null;

create or replace view public.daily_totals with (security_invoker = true) as
select user_id, session_date, sum(duration_seconds) as total_seconds,
  sum(duration_seconds::numeric / (goal_minutes_at_time * 60)) as goal_fraction,
  count(*) as session_count
from public.sessions where deleted_at is null group by user_id, session_date;

revoke insert, update, delete on public.sessions from authenticated, anon;
revoke insert on public.user_badges from authenticated, anon;
revoke update on public.profiles from authenticated, anon;

create or replace function public.update_study_profile(
  p_name text, p_goal integer, p_timezone text, p_complete_onboarding boolean default false
) returns public.profiles language plpgsql security definer set search_path = '' as $$
declare result public.profiles;
begin
  if auth.uid() is null then raise exception 'Sign in required' using errcode = '42501'; end if;
  if p_name is null or length(trim(p_name)) not between 1 and 40
    or p_goal is null or p_goal not in (30, 60, 120, 240)
    or p_timezone is null or not exists (select 1 from pg_timezone_names where name = p_timezone)
  then raise exception 'Invalid profile values' using errcode = '22023'; end if;
  update public.profiles set display_name = trim(p_name), daily_goal_minutes = p_goal,
    timezone = p_timezone,
    onboarded_at = case when p_complete_onboarding then coalesce(onboarded_at, now()) else onboarded_at end
  where id = auth.uid() returning * into result;
  if not found then raise exception 'Profile not found'; end if;
  return result;
end;
$$;

create or replace function public.get_study_summary()
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare today date; result jsonb;
begin
  if auth.uid() is null then raise exception 'Sign in required' using errcode = '42501'; end if;
  select (now() at time zone timezone)::date into today from public.profiles where id = auth.uid();
  select jsonb_build_object(
    'today', today,
    'total_seconds', coalesce((select sum(duration_seconds) from public.sessions where user_id = auth.uid() and deleted_at is null), 0),
    'session_count', (select count(*) from public.sessions where user_id = auth.uid() and deleted_at is null),
    'days', coalesce((select jsonb_agg(to_jsonb(d) order by session_date) from public.daily_totals d where user_id = auth.uid() and session_date >= today - 370), '[]'::jsonb),
    'recent', coalesce((select jsonb_agg(to_jsonb(s) order by started_at desc) from public.sessions s where user_id = auth.uid() and deleted_at is null and session_date >= today - 6), '[]'::jsonb),
    'badges', coalesce((select jsonb_agg(badge_id) from public.user_badges where user_id = auth.uid()), '[]'::jsonb),
    'subjects', coalesce((select jsonb_agg(subject order by subject) from (select distinct subject from public.sessions where user_id = auth.uid() and deleted_at is null and subject is not null) s), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;

create or replace function public.save_study_session(
  p_id uuid, p_revision bigint, p_duration integer, p_started_at timestamptz,
  p_timezone text, p_goal integer, p_subject text, p_finalize boolean default false
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid(); stored public.sessions; earned jsonb; total bigint;
begin
  if uid is null then raise exception 'Sign in required' using errcode = '42501'; end if;
  if p_id is null or p_revision is null or p_revision <= 0 or p_duration is null or p_duration < 300
    or p_started_at is null or p_goal is null or p_goal not in (30, 60, 120, 240)
    or length(p_subject) > 80 or p_timezone is null or p_finalize is null
    or not exists (select 1 from pg_timezone_names where name = p_timezone)
  then raise exception 'Invalid session values' using errcode = '22023'; end if;

  -- Serialize per user, including first inserts and badge threshold evaluation.
  perform 1 from public.profiles where id = uid and onboarded_at is not null for update;
  if not found then raise exception 'Complete onboarding first' using errcode = '42501'; end if;
  select * into stored from public.sessions where id = p_id for update;
  if found and stored.user_id <> uid then raise exception 'Session unavailable' using errcode = '42501'; end if;

  if stored.id is null then
    insert into public.sessions (id, user_id, session_date, duration_seconds, subject,
      goal_minutes_at_time, started_at, timezone, revision, finalized_at)
    values (p_id, uid, (p_started_at at time zone p_timezone)::date, p_duration,
      nullif(trim(p_subject), ''), p_goal, p_started_at, p_timezone, p_revision,
      case when p_finalize then now() end) returning * into stored;
  elsif stored.deleted_at is null and stored.finalized_at is null and p_revision > stored.revision then
    if stored.started_at <> p_started_at or stored.timezone <> p_timezone or stored.goal_minutes_at_time <> p_goal
      or p_duration < stored.duration_seconds
    then raise exception 'Session snapshot cannot move backward or change its starting goal/date' using errcode = '22023'; end if;
    update public.sessions set duration_seconds = p_duration, revision = p_revision,
      subject = nullif(trim(p_subject), ''), finalized_at = case when p_finalize then now() end
    where id = p_id returning * into stored;
  else
    -- Return the original award receipt after lost responses; the client consumes it once.
    return jsonb_build_object('session', to_jsonb(stored), 'awards', stored.awarded_badges,
      'summary', case when p_finalize then public.get_study_summary() end);
  end if;

  if p_finalize then
    select coalesce(sum(duration_seconds), 0) into total from public.sessions where user_id = uid and deleted_at is null;
    with inserted as (
      insert into public.user_badges(user_id, badge_id)
      select uid, id from public.badges where threshold_minutes * 60 <= total
      on conflict do nothing returning badge_id
    ) select coalesce(jsonb_agg(badge_id), '[]'::jsonb) into earned from inserted;
    update public.sessions set awarded_badges = earned where id = p_id returning * into stored;
  end if;
  return jsonb_build_object('session', to_jsonb(stored), 'awards', stored.awarded_badges,
    'summary', case when p_finalize then public.get_study_summary() end);
end;
$$;

create or replace function public.delete_study_session(p_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Sign in required' using errcode = '42501'; end if;
  perform 1 from public.profiles where id = auth.uid() for update;
  -- Tombstones keep late retries from recreating a deleted record. Badges stay earned.
  update public.sessions set deleted_at = coalesce(deleted_at, now())
    where id = p_id and user_id = auth.uid() and finalized_at is not null;
  if not found then raise exception 'Only completed sessions can be deleted' using errcode = '22023'; end if;
  return public.get_study_summary();
end;
$$;

revoke all on function public.update_study_profile(text, integer, text, boolean) from public, anon;
revoke all on function public.get_study_summary() from public, anon;
revoke all on function public.save_study_session(uuid, bigint, integer, timestamptz, text, integer, text, boolean) from public, anon;
revoke all on function public.delete_study_session(uuid) from public, anon;
grant execute on function public.update_study_profile(text, integer, text, boolean) to authenticated;
grant execute on function public.get_study_summary() to authenticated;
grant execute on function public.save_study_session(uuid, bigint, integer, timestamptz, text, integer, text, boolean) to authenticated;
grant execute on function public.delete_study_session(uuid) to authenticated;
