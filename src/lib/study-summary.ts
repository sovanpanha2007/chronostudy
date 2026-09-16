import type { PendingSave } from './timer';
import { confirmedSeconds } from './timer';
import type { StudySession, StudySummary } from './types';

export function optimisticSummary(base: StudySummary, pending: Record<string, PendingSave>, known: Record<string, StudySession>): StudySummary {
  const days = new Map(base.days.map((day) => [day.session_date, { ...day }]));
  const recent = new Map(base.recent.map((session) => [session.id, session]));
  let total = base.total_seconds;
  let count = base.session_count;
  for (const { timer, finalize } of Object.values(pending)) {
    const previous = known[timer.id];
    if (previous?.deleted_at || previous?.finalized_at) continue;
    const seconds = confirmedSeconds(timer);
    const delta = Math.max(0, seconds - (previous?.duration_seconds ?? 0));
    total += delta;
    if (!previous) count++;
    const day = days.get(timer.date) ?? { session_date: timer.date, total_seconds: 0, goal_fraction: 0, session_count: 0 };
    day.total_seconds += delta;
    day.goal_fraction += delta / (timer.goal * 60);
    if (!previous) day.session_count++;
    days.set(timer.date, day);
    recent.set(timer.id, { id: timer.id, user_id: timer.userId, session_date: timer.date,
      duration_seconds: seconds, subject: timer.subject || null, goal_minutes_at_time: timer.goal,
      started_at: new Date(timer.startedAt).toISOString(), timezone: timer.timezone, revision: timer.revision,
      finalized_at: finalize ? new Date(timer.lastAt).toISOString() : null, deleted_at: null });
  }
  return { ...base, total_seconds: total, session_count: count, days: [...days.values()],
    recent: [...recent.values()].sort((a, b) => b.started_at.localeCompare(a.started_at)) };
}
