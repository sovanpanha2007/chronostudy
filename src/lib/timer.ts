import type { Profile, StudySession } from './types';
import { resolveSessionDate } from './time';

export const MINIMUM_SECONDS = 300;
export const UNCERTAIN_GAP_MS = 120_000;

export type TimerState = {
  id: string;
  userId: string;
  startedAt: number;
  timezone: string;
  date: string;
  goal: number;
  subject: string;
  confirmedMs: number;
  lastAt: number;
  uncertainMs: number;
  mode: 'running' | 'paused' | 'review';
  reviewReason: 'away' | 'presence' | null;
  nextPresenceMs: number;
  revision: number;
  lastQueuedSeconds: number;
};
export type PendingSave = { timer: TimerState; finalize: boolean };
export type RecoveryStore = {
  version: 1;
  userId: string;
  active: TimerState | null;
  pending: Record<string, PendingSave>;
  seenAwards: string[];
  celebratedDays: string[];
};

export function newTimer(profile: Profile, subject: string, now: number, id: string): TimerState {
  return {
    id, userId: profile.id, startedAt: now, timezone: profile.timezone,
    date: resolveSessionDate(now, profile.timezone), goal: profile.daily_goal_minutes,
    subject: subject.trim(), confirmedMs: 0, lastAt: now, uncertainMs: 0,
    mode: 'running', reviewReason: null, nextPresenceMs: (profile.daily_goal_minutes + 120) * 60_000,
    revision: 1, lastQueuedSeconds: 0,
  };
}

export function advanceTimer(timer: TimerState, now: number): TimerState {
  if (timer.mode !== 'running') return timer;
  const delta = now - timer.lastAt;
  if (delta < 0 || delta > UNCERTAIN_GAP_MS) {
    return { ...timer, lastAt: now, uncertainMs: Math.max(0, delta), mode: 'review', reviewReason: 'away', revision: timer.revision + 1 };
  }
  const confirmedMs = timer.confirmedMs + delta;
  const presence = confirmedMs >= timer.nextPresenceMs;
  return { ...timer, confirmedMs, lastAt: now, mode: presence ? 'review' : 'running',
    reviewReason: presence ? 'presence' : null, revision: timer.revision + 1 };
}

export function recoverTimer(timer: TimerState, now: number): TimerState {
  if (timer.mode !== 'running') return timer;
  // Even a short gap after a crash needs consent: we don't know when execution stopped.
  return { ...timer, lastAt: now, uncertainMs: Math.max(0, now - timer.lastAt),
    mode: 'review', reviewReason: 'away', revision: timer.revision + 1 };
}

export function resolveReview(timer: TimerState, include: boolean, now: number): TimerState {
  const confirmedMs = timer.confirmedMs + (include ? timer.uncertainMs : 0);
  return { ...timer, confirmedMs, uncertainMs: 0, lastAt: now, mode: 'paused', reviewReason: null,
    nextPresenceMs: confirmedMs >= timer.nextPresenceMs ? confirmedMs + 120 * 60_000 : timer.nextPresenceMs,
    revision: timer.revision + 1 };
}

export function pauseTimer(timer: TimerState, now: number): TimerState {
  const advanced = advanceTimer(timer, now);
  return advanced.mode === 'review' ? advanced : { ...advanced, mode: 'paused', lastAt: now, revision: advanced.revision + 1 };
}

export function resumeTimer(timer: TimerState, now: number): TimerState {
  return timer.mode === 'paused' ? { ...timer, mode: 'running', lastAt: now, revision: timer.revision + 1 } : timer;
}

export function confirmedSeconds(timer: TimerState): number {
  return Math.floor(timer.confirmedMs / 1000);
}

export function enqueue(store: RecoveryStore, timer: TimerState, finalize: boolean): RecoveryStore {
  if (timer.userId !== store.userId) throw new Error('This session belongs to another account.');
  if (confirmedSeconds(timer) < MINIMUM_SECONDS) return store;
  const previous = store.pending[timer.id];
  if (previous && (previous.finalize || previous.timer.revision >= timer.revision)) return store;
  return { ...store, pending: { ...store.pending, [timer.id]: { timer, finalize } } };
}

export function acknowledge(store: RecoveryStore, session: StudySession): RecoveryStore {
  const entry = store.pending[session.id];
  if (!entry || session.user_id !== store.userId) return store;
  if (!session.deleted_at && !session.finalized_at && (session.revision < entry.timer.revision || entry.finalize)) return store;
  const pending = { ...store.pending };
  delete pending[session.id];
  return { ...store, pending };
}

export function emptyStore(userId: string): RecoveryStore {
  return { version: 1, userId, active: null, pending: {}, seenAwards: [], celebratedDays: [] };
}

export function storageKey(userId: string): string { return `chronostudy:recovery:v1:${userId}`; }

function validTimer(value: unknown, userId: string): value is TimerState {
  if (!value || typeof value !== 'object') return false;
  const t = value as TimerState;
  const valid = t.userId === userId && typeof t.id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(t.id)
    && typeof t.subject === 'string' && t.subject.length <= 80 && typeof t.timezone === 'string' && typeof t.date === 'string'
    && [t.startedAt, t.confirmedMs, t.lastAt, t.uncertainMs, t.nextPresenceMs, t.revision, t.lastQueuedSeconds]
      .every((n) => Number.isSafeInteger(n) && n >= 0)
    && t.revision > 0 && t.lastQueuedSeconds <= confirmedSeconds(t)
    && [30, 60, 120, 240].includes(t.goal) && ['running', 'paused', 'review'].includes(t.mode)
    && (t.mode === 'review' ? ['away', 'presence'].includes(t.reviewReason ?? '') : t.reviewReason === null);
  if (!valid) return false;
  try { return resolveSessionDate(t.startedAt, t.timezone) === t.date; }
  catch { return false; }
}

export function parseStore(raw: string | null, userId: string): RecoveryStore {
  if (raw === null) return emptyStore(userId);
  const value = JSON.parse(raw) as RecoveryStore;
  if (!value || value.version !== 1 || value.userId !== userId || !value.pending
    || typeof value.pending !== 'object' || Array.isArray(value.pending)
    || !Array.isArray(value.seenAwards) || !value.seenAwards.every((v) => typeof v === 'string')
    || !Array.isArray(value.celebratedDays) || !value.celebratedDays.every((v) => typeof v === 'string')
    || (value.active !== null && !validTimer(value.active, userId))
    || !Object.entries(value.pending).every(([id, entry]) => entry && validTimer(entry.timer, userId)
      && id === entry.timer.id && typeof entry.finalize === 'boolean')) {
    throw new Error('Your saved timer could not be read. It has been kept on this device.');
  }
  return value;
}
