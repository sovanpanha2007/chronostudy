'use client';
import { useState } from 'react';
import { dateLabel, formatDuration, addDays } from '@/lib/time';
import type { StudySession } from '@/lib/types';

export function SessionRows({ sessions, pendingIds, onDelete }: { sessions: StudySession[]; pendingIds: string[]; onDelete: (session: StudySession) => void }) {
  return <ul className="divide-y divide-line">{sessions.map((session) => <li key={session.id} className="flex items-center gap-3 py-4">
    <span aria-hidden="true" className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-line text-accent">↗</span>
    <div className="min-w-0 flex-1"><p className="truncate text-sm">{session.subject || 'A little time to focus'}</p><p className="mt-1 text-xs text-muted">{dateLabel(session.session_date)}{!session.finalized_at ? ' · In progress' : pendingIds.includes(session.id) ? ' · Waiting to sync' : ''}</p></div>
    <span className="whitespace-nowrap font-mono text-sm">{formatDuration(session.duration_seconds)}</span>
    {session.finalized_at && !pendingIds.includes(session.id) && <button className="icon-button text-muted" aria-label={`Delete ${session.subject || 'study'} session on ${dateLabel(session.session_date)}`} onClick={() => onDelete(session)}>×</button>}
  </li>)}</ul>;
}

export function SessionLog({ sessions, today, pendingIds, onDelete }: { sessions: StudySession[]; today: string; pendingIds: string[]; onDelete: (session: StudySession) => void }) {
  const [expanded, setExpanded] = useState(false);
  const week = sessions.filter((s) => s.session_date >= addDays(today, -6));
  return <section className="panel" aria-labelledby="sessions-title"><div className="mb-3 flex items-center justify-between gap-3"><div><p className="eyebrow mb-2">Time well spent</p><h2 id="sessions-title" className="text-xl tracking-tight">Recent sessions</h2></div><button className="text-sm text-muted hover:text-foreground" aria-expanded={expanded} aria-controls="session-list" onClick={() => setExpanded(!expanded)}>{expanded ? 'Show less ↑' : 'Past week ↗'}</button></div>
    <div id="session-list">{week.length ? <SessionRows sessions={expanded ? week : week.slice(0, 3)} pendingIds={pendingIds} onDelete={onDelete} /> : <div className="py-10 text-center"><p className="text-sm">Your next session starts the story.</p><p className="mt-2 text-xs text-muted">Focus for five minutes or more to add it here.</p></div>}</div>
    <p className="mt-4 text-xs text-muted">Looking further back? Pick a day on your heatmap.</p>
  </section>;
}
