// Real PostgreSQL semantics in memory; Supabase Auth is represented by its
// auth.users table and request JWT subject. No hosted data is accessed.
import { PGlite } from '@electric-sql/pglite';
import { readdir, readFile } from 'node:fs/promises';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { SaveReceipt, StudySummary } from '../src/lib/types';

let db: PGlite;
const userA = '00000000-0000-4000-8000-000000000001';
const userB = '00000000-0000-4000-8000-000000000002';
const sessionId = '00000000-0000-4000-8000-000000000010';

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated;
    -- Reproduce the broad default grants present on the hosted project.
    alter default privileges in schema public grant all on tables to anon, authenticated;
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema public, auth to authenticated, anon;
  `);
  const directory = new URL('../supabase/migrations/', import.meta.url);
  for (const file of (await readdir(directory)).filter((name) => name.endsWith('.sql')).sort()) {
    await db.exec(await readFile(new URL(file, directory), 'utf8'));
  }
  await db.query('insert into auth.users(id) values ($1), ($2)', [userA, userB]);
  await db.exec("update public.profiles set onboarded_at = now(), timezone = 'Asia/Phnom_Penh'");
}, 30_000);
afterAll(async () => { await db?.close(); });
beforeEach(async () => { await db.exec('begin'); await signIn(userA); });
afterEach(async () => { await db.exec('rollback'); });

async function signIn(id: string) {
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id]);
  await db.exec('set local role authenticated');
}
async function save({ revision = 1, duration = 300, finalize = false, id = sessionId,
  goal = 60, started = '2026-09-15T16:40:00Z' } = {}) {
  const result = await db.query<{ receipt: SaveReceipt }>(`select public.save_study_session(
    $1::uuid, $2::bigint, $3::integer, $4::timestamptz, 'Asia/Phnom_Penh', $5::integer, 'Math', $6::boolean
  ) as receipt`, [id, revision, duration, started, goal, finalize]);
  return result.rows[0].receipt;
}
async function summary() {
  return (await db.query<{ value: StudySummary }>('select public.get_study_summary() as value')).rows[0].value;
}

describe('phase 1 database contract', () => {
  it('applies every migration and seeds eight badge thresholds', async () => {
    expect((await db.query('select * from public.badges')).rows).toHaveLength(8);
    expect((await summary()).session_count).toBe(0);
  });
  it('keeps retries idempotent and ignores stale revisions', async () => {
    await save(); await save();
    await save({ revision: 3, duration: 900 });
    const stale = await save({ revision: 2, duration: 600 });
    expect(stale.session.duration_seconds).toBe(900);
    expect((await summary()).session_count).toBe(1);
    expect((await summary()).total_seconds).toBe(900);
  });
  it('finalizes once, preserves its award receipt, and cannot be reopened', async () => {
    const first = await save({ duration: 18_000, finalize: true });
    expect(first.awards.sort()).toEqual(['first-hour', 'getting-started']);
    const retry = await save({ duration: 18_000, finalize: true });
    expect(retry.awards.sort()).toEqual(first.awards.sort());
    const delayed = await save({ revision: 100, duration: 19_000 });
    expect(delayed.session.duration_seconds).toBe(18_000);
    expect(delayed.session.finalized_at).toBeTruthy();
    expect((await db.query('select * from public.user_badges')).rows).toHaveLength(2);
    expect((await save({ id: '00000000-0000-4000-8000-000000000011', finalize: true })).awards).toEqual([]);
  });
  it('does not award badges during checkpoints', async () => {
    expect((await save({ duration: 3600 })).awards).toEqual([]);
    expect((await summary()).badges).toEqual([]);
    expect((await save({ revision: 2, duration: 3600, finalize: true })).awards).toEqual(['first-hour']);
  });
  it('isolates session rows, daily totals, and badges between accounts', async () => {
    await save({ duration: 3600, finalize: true });
    await signIn(userB);
    expect((await db.query('select * from public.sessions')).rows).toEqual([]);
    expect((await db.query('select * from public.daily_totals')).rows).toEqual([]);
    expect((await summary()).total_seconds).toBe(0);
    expect((await summary()).badges).toEqual([]);
    await expect(save()).rejects.toThrow('Session unavailable');
  });
  it('denies direct badge awards', async () => {
    await expect(db.query("insert into public.user_badges(user_id, badge_id) values ($1, 'master')", [userA])).rejects.toThrow(/permission denied/);
  });
  it('denies direct session mutation that would bypass revision validation', async () => {
    await save();
    await expect(db.exec('update public.sessions set duration_seconds = 100000')).rejects.toThrow(/permission denied/);
  });
  it('removes inherited write and truncate privileges from API roles', async () => {
    const grants = await db.query<{ grantee: string; privilege_type: string }>(`
      select grantee, privilege_type from information_schema.table_privileges
      where table_schema = 'public' and grantee in ('anon', 'authenticated')
    `);
    expect(grants.rows).toHaveLength(5);
    expect(grants.rows.every((grant) => grant.grantee === 'authenticated' && grant.privilege_type === 'SELECT')).toBe(true);
    await expect(db.exec('truncate public.sessions')).rejects.toThrow(/permission denied/);
  });
  it('rejects sessions below five minutes', async () => {
    await expect(save({ duration: 299 })).rejects.toThrow('Invalid session values');
  });
  it('rejects newer revisions that roll duration backward', async () => {
    await save({ duration: 600 });
    await expect(save({ revision: 2, duration: 300 })).rejects.toThrow('Session snapshot cannot move backward');
  });
  it('rejects newer revisions that change the original goal', async () => {
    await save();
    await expect(save({ revision: 2, goal: 120 })).rejects.toThrow('Session snapshot cannot move backward');
  });
  it('keeps the starting day and original goal after profile changes', async () => {
    const first = await save({ duration: 1800 });
    expect(first.session.session_date).toBe('2026-09-15');
    await db.exec("select public.update_study_profile('Student', 120, 'Pacific/Auckland')");
    const final = await save({ revision: 2, duration: 3600, finalize: true });
    expect(final.session.session_date).toBe('2026-09-15');
    expect(final.session.goal_minutes_at_time).toBe(60);
    const totals = await db.query<{ goal_fraction: string }>('select goal_fraction from public.daily_totals');
    expect(Number(totals.rows[0].goal_fraction)).toBe(1);
  });
  it('deletes totals without revoking badges or allowing retry resurrection', async () => {
    await save({ duration: 3600, finalize: true });
    await db.query('select public.delete_study_session($1)', [sessionId]);
    const retry = await save({ revision: 50, duration: 7200, finalize: true });
    expect(retry.session.deleted_at).toBeTruthy();
    expect((await summary()).total_seconds).toBe(0);
    expect((await summary()).session_count).toBe(0);
    expect((await summary()).badges).toEqual(['first-hour']);
  });
  it('denies anonymous function access', async () => {
    await db.exec('set local role anon');
    await expect(summary()).rejects.toThrow(/permission denied/);
  });
  it('keeps the signup trigger private while still creating profiles', async () => {
    const result = await db.query<{ role: string; allowed: boolean }>(`
      select role, has_function_privilege(role, 'public.handle_new_user()', 'EXECUTE') as allowed
      from (values ('anon'), ('authenticated')) roles(role)
    `);
    expect(result.rows.every((row) => !row.allowed)).toBe(true);
    // The fixture users were inserted after all migrations, so this exercises the trigger.
    expect((await db.query('select id from public.profiles')).rows).toEqual([{ id: userA }]);
  });
  it('prevents one account from deleting another account’s session', async () => {
    await save({ finalize: true });
    await signIn(userB);
    await expect(db.query('select public.delete_study_session($1)', [sessionId])).rejects.toThrow('Only completed sessions');
  });
  it('updates only the authenticated account’s profile', async () => {
    await db.exec("select public.update_study_profile('Only A', 30, 'UTC')");
    await signIn(userB);
    const result = await db.query<{ display_name: string; daily_goal_minutes: number }>('select display_name, daily_goal_minutes from public.profiles');
    expect(result.rows).toEqual([{ display_name: 'Student', daily_goal_minutes: 60 }]);
  });
});
