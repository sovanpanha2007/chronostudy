-- Hosted projects can inherit broader table grants than a local database.
-- All application writes must use the validated RPCs from session_lifecycle.
revoke all on public.profiles, public.sessions, public.badges,
  public.user_badges, public.daily_totals from anon, authenticated;
grant select on public.profiles, public.sessions, public.badges,
  public.user_badges, public.daily_totals to authenticated;

-- The signup trigger qualifies the profiles table explicitly.
alter function public.handle_new_user() set search_path = '';
