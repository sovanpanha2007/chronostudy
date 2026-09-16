import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StudyController } from './study-controller';
import { emptyStore, enqueue, newTimer, storageKey } from './timer';
import type { Profile, StudySummary } from './types';

const api = vi.hoisted(() => ({ rpc: vi.fn(), getSession: vi.fn(), onAuthStateChange: vi.fn() }));
vi.mock('./supabase/client', () => ({ createClient: () => ({ rpc: api.rpc, auth: api }) }));
const profile: Profile = { id: 'user-a', display_name: 'Student', timezone: 'UTC', daily_goal_minutes: 60, onboarded_at: '2026-09-16' };
const summary: StudySummary = { today: '2026-09-16', total_seconds: 0, session_count: 0, days: [], recent: [], badges: [], subjects: [] };
const start = Date.parse('2026-09-16T10:00:00Z');
let values: Map<string, string>;
let writes: ReturnType<typeof vi.fn>;
let cleanups: (() => void)[];

beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(start); vi.resetAllMocks();
  values = new Map(); cleanups = [];
  writes = vi.fn((key: string, value: string) => { values.set(key, value); });
  vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null, setItem: writes });
  vi.stubGlobal('navigator', { onLine: false, locks: { request: vi.fn(async (_name, _options, callback) => callback()) } });
  vi.stubGlobal('window', { setInterval, clearInterval, addEventListener: vi.fn(), removeEventListener: vi.fn() });
  vi.stubGlobal('document', { addEventListener: vi.fn(), removeEventListener: vi.fn() });
  api.getSession.mockResolvedValue({ data: { session: { user: { id: profile.id } } } });
  api.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });
});
afterEach(async () => { cleanups.forEach((cleanup) => cleanup()); await Promise.resolve(); vi.useRealTimers(); vi.unstubAllGlobals(); });
function mount() { const controller = new StudyController(profile, summary); cleanups.push(controller.mount()); return controller; }

describe('timer persistence orchestration', () => {
  it('makes no request on start and creates one checkpoint at five minutes', async () => {
    const controller = mount(); controller.start('Math');
    await vi.advanceTimersByTimeAsync(299_000);
    expect(api.rpc).not.toHaveBeenCalled();
    expect(controller.getSnapshot().store.pending).toEqual({});
    await vi.advanceTimersByTimeAsync(1_000);
    expect(Object.values(controller.getSnapshot().store.pending)[0].timer.confirmedMs).toBe(300_000);
  });
  it('finishes in one storage write, with no active finalized recovery snapshot', async () => {
    const controller = mount(); controller.start('Math');
    await vi.advanceTimersByTimeAsync(301_000);
    writes.mockClear(); controller.stop();
    expect(writes).toHaveBeenCalledTimes(1);
    const durable = JSON.parse(values.get(storageKey(profile.id))!);
    expect(durable.active).toBeNull();
    expect(Object.values(durable.pending)).toMatchObject([{ finalize: true }]);
  });
  it('discards short sessions without a save request', async () => {
    const controller = mount(); controller.start('Math');
    await vi.advanceTimersByTimeAsync(299_000); controller.stop();
    expect(controller.getSnapshot().store.active).toBeNull();
    expect(controller.getSnapshot().store.pending).toEqual({});
    expect(api.rpc).not.toHaveBeenCalled();
  });
  it('recovers a legacy finish snapshot as pending sync, never as an active timer', () => {
    const timer = { ...newTimer(profile, 'Math', start, crypto.randomUUID()), confirmedMs: 300_000 };
    const store = enqueue({ ...emptyStore(profile.id), active: timer }, timer, true);
    values.set(storageKey(profile.id), JSON.stringify(store));
    const controller = mount();
    expect(controller.getSnapshot().store.active).toBeNull();
    expect(Object.keys(controller.getSnapshot().store.pending)).toHaveLength(1);
  });
  it('allows retry after storage fails during initial mount', () => {
    writes.mockImplementationOnce(() => { throw new Error('Quota exceeded'); });
    const controller = mount();
    expect(controller.getSnapshot().ready).toBe(false);
    expect(controller.getSnapshot().storageFailed).toBe(true);
    controller.retry();
    expect(controller.getSnapshot().ready).toBe(true);
    controller.start('Math');
    expect(controller.getSnapshot().store.active?.mode).toBe('running');
  });
  it('preserves corrupt recovery data even after an auth refresh and retry', () => {
    values.set(storageKey(profile.id), '{broken');
    const controller = mount();
    api.onAuthStateChange.mock.calls[0][0]('TOKEN_REFRESHED', { user: { id: profile.id } });
    controller.retry(); controller.start('Math');
    expect(controller.getSnapshot().ready).toBe(false);
    expect(values.get(storageKey(profile.id))).toBe('{broken');
  });
  it('saves twice in ten minutes and finalizes once without duplicating totals', async () => {
    Object.assign(navigator, { onLine: true });
    api.rpc.mockImplementation(async (_name, args) => {
      const session = { id: args.p_id, user_id: profile.id, duration_seconds: args.p_duration, session_date: summary.today,
        goal_minutes_at_time: args.p_goal, started_at: args.p_started_at, timezone: args.p_timezone, subject: args.p_subject,
        revision: args.p_revision, finalized_at: args.p_finalize ? new Date().toISOString() : null, deleted_at: null };
      return { data: { session, awards: [], summary: args.p_finalize ? { ...summary, total_seconds: args.p_duration, session_count: 1,
        recent: [session], days: [{ session_date: summary.today, total_seconds: args.p_duration, session_count: 1, goal_fraction: args.p_duration / 3600 }] } : null }, error: null };
    });
    const controller = mount(); controller.start('Math');
    await vi.advanceTimersByTimeAsync(600_000);
    expect(api.rpc).toHaveBeenCalledTimes(2);
    expect(controller.getSnapshot().summary.total_seconds).toBe(600);
    controller.stop(); await vi.advanceTimersByTimeAsync(0);
    expect(api.rpc).toHaveBeenCalledTimes(3);
    expect(controller.getSnapshot().store.pending).toEqual({});
    expect(controller.getSnapshot().summary.session_count).toBe(1);
    expect(controller.getSnapshot().summary.total_seconds).toBe(600);
  });
});
