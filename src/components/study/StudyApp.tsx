'use client';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { StudyController } from '@/lib/study-controller';
import { createClient } from '@/lib/supabase/client';
import { BADGES } from '@/lib/badges';
import { dateLabel, formatDuration } from '@/lib/time';
import type { Profile, StudySession, StudySummary } from '@/lib/types';
import { Brand } from '@/components/Brand';
import { Timer } from './Timer';
import { Heatmap } from './Heatmap';
import { SessionLog, SessionRows } from './SessionLog';
import { Modal } from '@/components/ui/Modal';
import { SettingsModal } from './SettingsModal';

export function StudyApp({ profile, initialSummary }: { profile: Profile; initialSummary: StudySummary }) {
  const router = useRouter();
  const [controller] = useState(() => new StudyController(profile, initialSummary));
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  const [settings, setSettings] = useState(false);
  const [deleting, setDeleting] = useState<StudySession | null>(null);
  const [day, setDay] = useState<{ date: string; sessions: StudySession[]; loading: boolean; error?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const reduced = useReducedMotion();
  useEffect(() => controller.mount(), [controller]);
  const { summary, store } = snapshot;
  const currentProfile = controller.profile;
  const today = summary.days.find((d) => d.session_date === summary.today);
  const earned = BADGES.filter((b) => summary.badges.includes(b.id));
  const currentBadge = earned.at(-1);
  const nextBadge = BADGES.find((b) => !summary.badges.includes(b.id));
  const pendingIds = Object.keys(store.pending);
  const pendingDay = summary.recent.filter((session) => session.session_date === day?.date && pendingIds.includes(session.id));
  const daySessions = [...pendingDay, ...(day?.sessions ?? []).filter((session) => !pendingIds.includes(session.id))]
    .sort((a, b) => b.started_at.localeCompare(a.started_at));
  const dayTotal = summary.days.find((total) => total.session_date === day?.date);

  async function openDay(date: string) {
    setDay({ date, sessions: [], loading: true });
    const { data, error } = await createClient().from('sessions').select('*').eq('session_date', date).is('deleted_at', null).order('started_at', { ascending: false });
    setDay((current) => current?.date === date ? { date, sessions: (data ?? []) as StudySession[], loading: false, error: error?.message } : current);
  }
  async function deleteSession() {
    if (!deleting) return;
    setBusy(true); setError('');
    const { data, error } = await createClient().rpc('delete_study_session', { p_id: deleting.id });
    setBusy(false);
    if (error) { setError(error.message); return; }
    controller.replaceSummary(data as StudySummary);
    setDay((current) => current ? { ...current, sessions: current.sessions.filter((s) => s.id !== deleting.id) } : current);
    setDeleting(null);
  }
  async function signOut() {
    controller.pause(); setError('');
    const { error } = await createClient().auth.signOut({ scope: 'local' });
    if (error) { setError(error.message); return; }
    router.replace('/login');
    router.refresh();
  }
  const review = store.active?.mode === 'review' ? store.active : null;
  return <div className="mx-auto w-full max-w-[1160px] px-5 sm:px-9">
    <header className="flex min-h-24 items-center justify-between gap-4 border-b border-line"><Brand /><div className="flex items-center gap-3 sm:gap-5"><div className="text-right"><p className="max-w-32 truncate text-sm">{currentProfile.display_name}</p><p className="mt-1 text-[10px] uppercase tracking-widest text-accent">{currentBadge?.name ?? 'A new beginning'}</p></div><button aria-label="Open settings" className="icon-button" onClick={() => setSettings(true)}><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M4 7h16M4 17h16" /><circle cx="9" cy="7" r="3" fill="var(--color-background)" /><circle cx="16" cy="17" r="3" fill="var(--color-background)" /></svg></button></div></header>
    <main id="main" className="pb-8">
      <Timer controller={controller} snapshot={snapshot} />
      {(snapshot.error || error) && <div role="alert" className="notice error mb-7 flex flex-wrap items-center justify-between gap-3"><span>{snapshot.error || error}</span>{(snapshot.ready || snapshot.storageFailed) && <button className="underline" onClick={() => controller.retry()}>Retry saving</button>}</div>}
      <section aria-label="Study statistics" className="stats-row">
        {[{ label: 'Today’s focus', value: formatDuration(today?.total_seconds ?? 0), sub: `${Math.round((today?.goal_fraction ?? 0) * 100)}% of your daily goal` },
          { label: 'Time invested', value: formatDuration(summary.total_seconds), sub: 'Every minute is yours' },
          { label: 'Sessions logged', value: String(summary.session_count), sub: 'Small starts, real progress' },
          { label: 'Daily goal', value: formatDuration(currentProfile.daily_goal_minutes * 60), sub: 'Your pace. Always.' }].map((stat) => <div key={stat.label} className="stat"><p className="text-xs text-muted">{stat.label}</p><AnimatePresence initial={false} mode="wait"><motion.p key={stat.value} initial={reduced ? false : { opacity: 0.5, y: 3 }} animate={{ opacity: 1, y: 0 }} className="my-2.5 font-mono text-2xl tracking-tight">{stat.value}</motion.p></AnimatePresence><p className="text-[11px] text-muted">{stat.sub}</p></div>)}
      </section>
      <div className="mt-6 space-y-6"><Heatmap today={summary.today} days={summary.days} onDay={(date) => void openDay(date)} />
        <div className="grid gap-6 lg:grid-cols-[1.65fr_1fr]"><SessionLog sessions={summary.recent} today={summary.today} pendingIds={pendingIds} onDelete={setDeleting} />
          <section className="panel flex flex-col" aria-labelledby="badge-title"><p className="eyebrow mb-2">The time adds up</p><h2 id="badge-title" className="text-xl tracking-tight">{nextBadge ? 'Your next milestone' : 'Look how far you’ve come'}</h2><div className="my-6 flex items-center gap-5"><div className="badge-medallion" aria-hidden="true">✧</div><div><p className="text-lg">{nextBadge?.name ?? 'Master'}</p><p className="mt-1 text-xs text-muted">{nextBadge ? `${formatDuration(nextBadge.minutes * 60)} of lifetime focus` : '500 hours of lifetime focus'}</p></div></div><progress className="badge-progress" max={nextBadge?.minutes ?? 30000} value={Math.min(summary.total_seconds / 60, nextBadge?.minutes ?? 30000)} aria-label="Progress toward next badge" /><p className="mt-3 text-xs leading-5 text-muted">{nextBadge ? `${formatDuration(Math.max(0, nextBadge.minutes * 60 - summary.total_seconds))} to go. One session at a time.` : 'Every new session is another page in your story.'}</p><div className="mt-auto pt-6 flex flex-wrap gap-2">{BADGES.map((badge) => <span key={badge.id} title={`${badge.name} — ${formatDuration(badge.minutes * 60)}`} aria-label={`${badge.name}: ${summary.badges.includes(badge.id) ? 'earned' : 'not yet earned'}`} className={`badge-dot ${summary.badges.includes(badge.id) ? 'earned' : ''}`}>✧</span>)}</div></section>
        </div>
      </div>
    </main>
    <footer className="flex flex-wrap justify-between gap-3 border-t border-line py-7 text-xs text-muted"><p>A little today is more than yesterday’s someday.</p><p>Made for your own pace.</p></footer>
    {settings && !review && <SettingsModal profile={currentProfile} onClose={() => setSettings(false)} onSaved={(p, s) => controller.updateProfile(p, s)} onSignOut={() => void signOut()} />}
    {review && <Modal title={review.reviewReason === 'presence' ? 'Still with us?' : 'Welcome back.'}>
      <p className="mb-6 leading-7 text-muted">{review.reviewReason === 'presence' ? 'You’ve put in a good stretch of focus. Take a breath before you carry on.' : `You were away for ${formatDuration(review.uncertainMs / 1000)}. Should that time count toward this session?`}</p><p className="mb-6 text-xs text-muted">Your timer is paused while you decide.</p><div className="flex flex-wrap gap-3">{review.reviewReason === 'away' && <button className="button primary" onClick={() => controller.review(true)}>Include that time</button>}<button className={`button ${review.reviewReason === 'presence' ? 'primary' : 'secondary'}`} onClick={() => controller.review(false)}>{review.reviewReason === 'presence' ? 'I’m here' : 'Leave that time out'}</button></div>
    </Modal>}
    {day && !deleting && !review && <Modal title={dateLabel(day.date)} onClose={() => setDay(null)}>{day.loading ? <p role="status" className="text-muted">Loading this day…</p> : <>{day.error && <p role="alert" className="notice error mb-3">{day.error}</p>}<p className="mb-3 text-sm text-muted">{formatDuration(dayTotal?.total_seconds ?? daySessions.reduce((sum, s) => sum + s.duration_seconds, 0))} of focus · {Math.round((dayTotal?.goal_fraction ?? daySessions.reduce((sum, session) => sum + session.duration_seconds / (session.goal_minutes_at_time * 60), 0)) * 100)}% of goal</p>{daySessions.length ? <SessionRows sessions={daySessions} pendingIds={pendingIds} onDelete={setDeleting} /> : !day.error && <p className="py-6 text-sm text-muted">A quiet square. There’s room for many more days.</p>}</>}</Modal>}
    {deleting && !review && <Modal title="Delete this session?" onClose={busy ? undefined : () => { setDeleting(null); setError(''); }}><p className="mb-6 leading-7 text-muted">Remove {formatDuration(deleting.duration_seconds)} from {dateLabel(deleting.session_date)}? Your totals and heatmap will update. Earned badges stay yours.</p>{error && <p role="alert" className="notice error mb-4">{error}</p>}<div className="flex gap-3"><button className="button secondary" disabled={busy} onClick={() => setDeleting(null)}>Keep session</button><button className="button danger" disabled={busy} onClick={() => void deleteSession()}>{busy ? 'Deleting…' : 'Delete session'}</button></div></Modal>}
    {snapshot.celebration && !review && !settings && !day && !deleting && <Modal title={snapshot.celebration.awards.length ? 'A milestone worth a moment.' : 'You made time for your goal.'} onClose={() => controller.dismissCelebration()}><motion.div initial={reduced ? false : { scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="py-3 text-center"><div className="badge-medallion mx-auto mb-6" aria-hidden="true">✧</div>{snapshot.celebration.awards.map((id) => <p key={id} className="my-2 text-2xl text-accent">{BADGES.find((b) => b.id === id)?.name}</p>)}<p className="my-5 leading-7 text-muted">{snapshot.celebration.goal ? 'Your daily goal is complete. That square is a little brighter because you showed up.' : 'All those small sessions brought you here. This one is yours to keep.'}</p><button className="button primary" onClick={() => controller.dismissCelebration()}>Keep growing →</button></motion.div></Modal>}
  </div>;
}
