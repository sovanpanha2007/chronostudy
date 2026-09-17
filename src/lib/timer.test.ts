import { describe, expect, it } from 'vitest';
import { acknowledge, advanceTimer, confirmedSeconds, emptyStore, enqueue, newTimer, parseStore, pauseTimer, recoverTimer, resolveReview, resumeTimer } from './timer';
import { optimisticSummary } from './study-summary';
import type { Profile, StudySession, StudySummary } from './types';

const profile: Profile = { id: 'user-a', display_name: 'Student', timezone: 'Asia/Phnom_Penh', daily_goal_minutes: 60, onboarded_at: '2026-09-15' };
const start = Date.parse('2026-09-15T16:40:00Z');
const timer = () => newTimer(profile, 'Math', start, '00000000-0000-4000-8000-000000000001');
const qualifying = () => ({ ...timer(), confirmedMs: 300_000, revision: 10 });
const session = (revision = 10): StudySession => ({ id: timer().id, user_id: profile.id, duration_seconds: 300, session_date: timer().date,
  goal_minutes_at_time: 60, subject: 'Math', started_at: new Date(start).toISOString(), timezone: profile.timezone, revision, finalized_at: null, deleted_at: null });

describe('elapsed time and review', () => {
  it('counts long background gaps without pausing or counting them twice', () => {
    const normal = advanceTimer(timer(), start + 60_000);
    expect(confirmedSeconds(normal)).toBe(60);
    const away = advanceTimer(normal, start + 240_001);
    expect(confirmedSeconds(away)).toBe(240);
    expect(away.mode).toBe('running');
    expect(away.uncertainMs).toBe(0);
    expect(advanceTimer(away, start + 240_001).confirmedMs).toBe(240_001);
    expect(confirmedSeconds(advanceTimer(away, start + 900_000))).toBe(900);
  });
  it('excludes explicit pauses and preserves the starting date and goal', () => {
    const paused = pauseTimer(timer(), start + 60_000);
    const resumed = resumeTimer(paused, start + 3_600_000);
    const next = advanceTimer(resumed, start + 3_660_000);
    expect(confirmedSeconds(next)).toBe(120);
    expect(next.date).toBe('2026-09-15');
    expect(next.goal).toBe(60);
    expect(next.id).toBe(timer().id);
  });
  it('reviews even a short running recovery gap, but never a paused gap', () => {
    const recovered = recoverTimer(timer(), start + 1_000);
    expect(recovered.mode).toBe('review');
    expect(advanceTimer(recovered, start + 900_000)).toBe(recovered);
    expect(confirmedSeconds(resolveReview(recovered, true, start + 900_000))).toBe(1);
    expect(confirmedSeconds(resolveReview(recovered, false, start + 900_000))).toBe(0);
    const paused = pauseTimer(timer(), start + 60_000);
    expect(recoverTimer(paused, start + 900_000)).toBe(paused);
  });
  it('pauses on a backward clock change without subtracting duration', () => {
    const before = { ...timer(), confirmedMs: 60_000 };
    const after = advanceTimer(before, start - 1_000);
    expect(after.mode).toBe('review');
    expect(after.confirmedMs).toBe(60_000);
    expect(after.uncertainMs).toBe(0);
  });
  it('keeps running past the former presence threshold', () => {
    const before = { ...timer(), confirmedMs: 180 * 60_000 - 1_000 };
    const next = advanceTimer(before, start + 1_000);
    expect(next.mode).toBe('running');
    expect(next.reviewReason).toBeNull();
    const later = advanceTimer(next, start + 4 * 3_600_000 + 1_000);
    expect(later.mode).toBe('running');
    expect(confirmedSeconds(later)).toBe(7 * 3_600);
  });
});

describe('durable save queue', () => {
  it('discards 4:59 and accepts 5:00', () => {
    const store = emptyStore(profile.id);
    expect(enqueue(store, { ...timer(), confirmedMs: 299_999 }, true)).toBe(store);
    expect(Object.keys(enqueue(store, qualifying(), true).pending)).toHaveLength(1);
  });
  it('coalesces newer snapshots and protects finalization from delayed checkpoints', () => {
    const queued = enqueue(emptyStore(profile.id), qualifying(), false);
    expect(enqueue(queued, { ...qualifying(), revision: 9 }, false)).toBe(queued);
    const finalized = enqueue(queued, { ...qualifying(), revision: 11 }, true);
    expect(enqueue(finalized, { ...qualifying(), revision: 12 }, false)).toBe(finalized);
    expect(Object.keys(finalized.pending)).toHaveLength(1);
  });
  it('keeps multiple completed offline sessions through a reload', () => {
    const first = enqueue(emptyStore(profile.id), qualifying(), true);
    const both = enqueue(first, { ...qualifying(), id: '00000000-0000-4000-8000-000000000002' }, true);
    expect(parseStore(JSON.stringify(both), profile.id)).toEqual(both);
    expect(Object.keys(both.pending)).toHaveLength(2);
  });
  it('does not acknowledge a newer pending revision or a finalization with a checkpoint', () => {
    const queued = enqueue(emptyStore(profile.id), qualifying(), false);
    expect(acknowledge(queued, session(9))).toBe(queued);
    expect(acknowledge(queued, session()).pending).toEqual({});
    const final = enqueue(emptyStore(profile.id), qualifying(), true);
    expect(acknowledge(final, session())).toBe(final);
    expect(acknowledge(final, { ...session(), finalized_at: '2026-09-15' }).pending).toEqual({});
    expect(acknowledge(final, { ...session(), deleted_at: '2026-09-15' }).pending).toEqual({});
  });
  it('rejects cross-account state and acknowledgements', () => {
    const queued = enqueue(emptyStore(profile.id), qualifying(), false);
    expect(() => enqueue(emptyStore('user-b'), qualifying(), false)).toThrow();
    expect(() => parseStore(JSON.stringify(queued), 'user-b')).toThrow();
    expect(acknowledge(queued, { ...session(), user_id: 'user-b' })).toBe(queued);
  });
  it('rejects corrupted recovery data rather than silently replacing it', () => {
    expect(() => parseStore('{broken', profile.id)).toThrow();
    expect(() => parseStore(JSON.stringify({ ...emptyStore(profile.id), active: { ...timer(), confirmedMs: null } }), profile.id)).toThrow();
    for (const invalid of [{ timezone: 'Invalid/Zone' }, { date: '2020-01-01' }, { revision: 0 }, { reviewReason: 'away' }]) {
      expect(() => parseStore(JSON.stringify({ ...emptyStore(profile.id), active: { ...timer(), ...invalid } }), profile.id)).toThrow();
    }
  });
});

describe('optimistic totals', () => {
  const base: StudySummary = { today: '2026-09-15', total_seconds: 300, session_count: 1,
    days: [{ session_date: '2026-09-15', total_seconds: 300, session_count: 1, goal_fraction: 300 / 3600 }], recent: [session()], badges: [], subjects: [] };
  it('adds only the unsaved delta, with each session’s original goal', () => {
    const updated = { ...qualifying(), confirmedMs: 600_000 };
    const another = { ...qualifying(), id: '00000000-0000-4000-8000-000000000002', goal: 120 };
    const pending = enqueue(enqueue(emptyStore(profile.id), updated, false), another, true).pending;
    const result = optimisticSummary(base, pending, { [session().id]: session() });
    expect(result.total_seconds).toBe(900);
    expect(result.session_count).toBe(2);
    expect(result.days[0].goal_fraction).toBeCloseTo(600 / 3600 + 300 / 7200);
    expect(base.total_seconds).toBe(300);
  });
  it('does not resurrect finalized or deleted sessions', () => {
    const pending = enqueue(emptyStore(profile.id), qualifying(), true).pending;
    for (const terminal of [{ finalized_at: '2026-09-15' }, { deleted_at: '2026-09-15' }]) {
      expect(optimisticSummary(base, pending, { [session().id]: { ...session(), ...terminal } })).toEqual(base);
    }
  });
});
