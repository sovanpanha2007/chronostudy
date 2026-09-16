'use client';

import { createClient } from './supabase/client';
import { acknowledge, advanceTimer, confirmedSeconds, emptyStore, enqueue, newTimer, parseStore,
  pauseTimer, recoverTimer, resolveReview, resumeTimer, storageKey, type RecoveryStore } from './timer';
import { optimisticSummary } from './study-summary';
import type { Profile, SaveReceipt, StudySession, StudySummary } from './types';
import { resolveSessionDate } from './time';

export type ControllerSnapshot = {
  store: RecoveryStore; summary: StudySummary; leader: boolean; ready: boolean; storageFailed: boolean;
  status: string; error: string | null; celebration: { awards: string[]; goal: boolean } | null;
};

export class StudyController {
  private store: RecoveryStore;
  private base: StudySummary;
  private known: Record<string, StudySession>;
  private snapshot: ControllerSnapshot;
  private listeners = new Set<() => void>();
  private leader = false;
  private ready = false;
  private recoveryLoaded = false;
  private synced = false;
  private syncing = false;
  private attempts = 0;
  private retryAt = 0;
  private persistedAt = 0;
  private generation = 0;
  private error: string | null = null;
  private storageFailed = false;
  private celebration: ControllerSnapshot['celebration'] = null;

  constructor(public profile: Profile, summary: StudySummary) {
    this.store = emptyStore(profile.id);
    this.base = summary;
    this.known = Object.fromEntries(summary.recent.map((s) => [s.id, s]));
    this.snapshot = { store: this.store, summary, leader: false, ready: false, storageFailed: false, status: 'Preparing your timer…', error: null, celebration: null };
  }

  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  getSnapshot = () => this.snapshot;

  private emit() {
    const pending = Object.keys(this.store.pending).length;
    this.snapshot = {
      store: this.store,
      summary: this.synced ? optimisticSummary(this.base, this.store.pending, this.known) : this.base,
      leader: this.leader, ready: this.ready, storageFailed: this.storageFailed, error: this.error, celebration: this.celebration,
      status: !this.leader ? 'Your timer is open in another tab.' : this.storageFailed ? 'Device storage needs attention'
        : this.syncing ? 'Saving…' : pending ? 'Saved on this device — waiting to sync'
        : this.store.active ? 'Recovery saved on this device' : 'All caught up',
    };
    this.listeners.forEach((listener) => listener());
  }

  private persist(): boolean {
    try {
      localStorage.setItem(storageKey(this.profile.id), JSON.stringify(this.store));
      this.persistedAt = Date.now();
      if (this.storageFailed) this.error = null;
      this.storageFailed = false;
      return true;
    } catch {
      this.storageFailed = true;
      this.error = 'Device storage is unavailable or full. Your timer is paused. Free some space, then retry saving before leaving this page.';
      if (this.store.active?.mode === 'running') {
        this.store = { ...this.store, active: pauseTimer(this.store.active, Date.now()) };
      }
      return false;
    }
  }

  mount = (): (() => void) => {
    const generation = ++this.generation;
    const abort = new AbortController();
    let release: (() => void) | undefined;
    const live = () => this.generation === generation && !abort.signal.aborted;
    if (!navigator.locks) {
      this.error = 'This browser cannot safely coordinate timer tabs. Open Chronostudy in a current browser with Web Locks support.';
      this.emit();
      return () => { abort.abort(); };
    }
    this.emit();
    void navigator.locks.request(`chronostudy:${this.profile.id}`, { signal: abort.signal }, async () => {
      if (!live()) return;
      this.leader = true;
      this.ready = false;
      this.recoveryLoaded = false;
      try {
        this.store = parseStore(localStorage.getItem(storageKey(this.profile.id)), this.profile.id);
        this.recoveryLoaded = true;
        // A durable finalization owns the session, even if an older client left
        // an active recovery snapshot beside it before closing.
        if (this.store.active && this.store.pending[this.store.active.id]?.finalize) {
          this.store = { ...this.store, active: null };
        }
        if (this.store.active) this.store = { ...this.store, active: recoverTimer(this.store.active, Date.now()) };
        this.ready = this.persist();
        this.synced = Object.keys(this.store.pending).length === 0;
      } catch (error) {
        this.error = error instanceof Error ? error.message : 'Saved recovery data could not be read.';
        this.ready = false;
      }
      this.emit();
      const tick = () => {
        if (!this.ready || this.storageFailed) return;
        const active = this.store.active;
        if (active?.mode === 'running') {
          const next = advanceTimer(active, Date.now());
          this.store = { ...this.store, active: next };
          if (confirmedSeconds(next) - next.lastQueuedSeconds >= 300 || next.mode === 'review') this.queue(false);
          if (Date.now() - this.persistedAt >= 10_000 || next.mode === 'review') this.persist();
        }
        const today = resolveSessionDate(Date.now(), this.profile.timezone);
        if (today !== this.base.today) this.base = { ...this.base, today };
        this.emit();
        if (Date.now() >= this.retryAt) void this.flush(generation);
      };
      const hidden = () => {
        if (!this.ready) return;
        if (this.store.active?.mode === 'running') this.store = { ...this.store, active: advanceTimer(this.store.active, Date.now()) };
        this.persist();
        this.emit();
      };
      const reconnect = () => { this.retryAt = 0; this.attempts = 0; void this.flush(generation); };
      const timer = window.setInterval(tick, 1000);
      document.addEventListener('visibilitychange', hidden);
      window.addEventListener('pagehide', hidden);
      window.addEventListener('online', reconnect);
      const client = createClient();
      const { data: auth } = client.auth.onAuthStateChange((event, session) => {
        if (session?.user.id === this.profile.id) {
          if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
            this.retryAt = 0;
            if (this.recoveryLoaded && !this.storageFailed) this.ready = true;
            this.emit();
          }
        } else if (event === 'SIGNED_OUT' || session) {
          if (this.store.active) this.store = { ...this.store, active: pauseTimer(this.store.active, Date.now()) };
          if (this.ready) this.persist();
          this.ready = false;
          this.error = 'Sign in to the same account to recover this timer and sync your sessions.';
          this.emit();
        }
      });
      void this.flush(generation);
      await new Promise<void>((resolve) => { release = resolve; if (!live()) resolve(); });
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', hidden);
      window.removeEventListener('pagehide', hidden);
      window.removeEventListener('online', reconnect);
      auth.subscription.unsubscribe();
      this.leader = false;
    }).catch((error: Error) => { if (live()) { this.error = error.message; this.emit(); } });
    return () => { abort.abort(); release?.(); };
  };

  private queue(finalize: boolean, persist = true) {
    const active = this.store.active;
    if (!active || confirmedSeconds(active) < 300) return;
    if (!finalize && confirmedSeconds(active) === active.lastQueuedSeconds) return;
    const timer = { ...active, revision: active.revision + 1, lastQueuedSeconds: confirmedSeconds(active) };
    this.store = enqueue({ ...this.store, active: timer }, timer, finalize);
    if (persist) this.persist();
  }

  start(subject: string) {
    if (!this.ready || !this.leader || this.storageFailed || this.store.active) return;
    this.store = { ...this.store, active: newTimer(this.profile, subject, Date.now(), crypto.randomUUID()) };
    this.persist(); this.emit();
  }
  pause() {
    if (!this.canControl()) return;
    this.store = { ...this.store, active: pauseTimer(this.store.active!, Date.now()) };
    this.queue(false); this.persist(); this.emit(); void this.flush(this.generation);
  }
  resume() {
    if (!this.canControl()) return;
    this.store = { ...this.store, active: resumeTimer(this.store.active!, Date.now()) };
    this.persist(); this.emit();
  }
  review(include: boolean) {
    if (!this.canControl() || this.store.active?.mode !== 'review') return;
    this.store = { ...this.store, active: resolveReview(this.store.active, include, Date.now()) };
    this.queue(false); this.persist(); this.emit(); void this.flush(this.generation);
  }
  stop() {
    if (!this.canControl()) return;
    const active = pauseTimer(this.store.active!, Date.now());
    this.store = { ...this.store, active };
    if (active.mode !== 'review') {
      // Persist the final queue entry and removal of the active timer together.
      this.queue(true, false);
      this.store = { ...this.store, active: null };
    }
    this.persist(); this.emit(); void this.flush(this.generation);
  }
  private canControl() { return this.leader && this.ready && !this.storageFailed && !!this.store.active; }
  dismissCelebration() { this.celebration = null; this.emit(); }
  retry() {
    if (!this.leader || (!this.ready && !this.storageFailed)) return;
    this.error = null; this.retryAt = 0;
    if (this.persist()) { this.ready = true; void this.flush(this.generation); }
    this.emit();
  }
  updateProfile(profile: Profile, summary: StudySummary) { this.profile = profile; this.replaceSummary(summary); }
  replaceSummary(summary: StudySummary) {
    this.base = summary;
    for (const session of summary.recent) this.known[session.id] = session;
    this.emit();
  }

  private applyCheckpoint(session: StudySession) {
    const old = this.known[session.id];
    if (old && old.revision >= session.revision) return;
    const delta = session.duration_seconds - (old?.duration_seconds ?? 0);
    const days = this.base.days.map((day) => ({ ...day }));
    let day = days.find((day) => day.session_date === session.session_date);
    if (!day) { day = { session_date: session.session_date, total_seconds: 0, goal_fraction: 0, session_count: 0 }; days.push(day); }
    day.total_seconds += delta;
    day.goal_fraction += delta / (session.goal_minutes_at_time * 60);
    day.session_count += old ? 0 : 1;
    this.base = { ...this.base, total_seconds: this.base.total_seconds + delta, session_count: this.base.session_count + (old ? 0 : 1), days,
      recent: [session, ...this.base.recent.filter((s) => s.id !== session.id)].sort((a, b) => b.started_at.localeCompare(a.started_at)) };
  }

  private async flush(generation: number) {
    if (!this.leader || !this.ready || this.storageFailed || this.syncing || !navigator.onLine || Date.now() < this.retryAt) return;
    if (!Object.keys(this.store.pending).length) return;
    this.syncing = true; this.emit();
    const live = () => this.leader && this.ready && generation === this.generation;
    try {
      const client = createClient();
      const { data: auth } = await client.auth.getSession();
      if (!live()) return;
      if (auth.session?.user.id !== this.profile.id) {
        this.retryAt = Infinity;
        throw new Error('Sign in to the same account to sync your saved sessions.');
      }
      if (!this.synced) {
        const ids = Object.keys(this.store.pending);
        const [sessions, summary] = await Promise.all([
          client.from('sessions').select('*').in('id', ids), client.rpc('get_study_summary'),
        ]);
        if (sessions.error) throw sessions.error;
        if (summary.error) throw summary.error;
        if (!live()) return;
        this.base = summary.data as StudySummary;
        this.known = Object.fromEntries([...this.base.recent, ...(sessions.data as StudySession[])].map((s) => [s.id, s]));
        this.synced = true;
      }
      for (const id of Object.keys(this.store.pending)) {
        if (!live()) return;
        const entry = this.store.pending[id];
        if (!entry) continue;
        const t = entry.timer;
        const before = this.base.days.find((d) => d.session_date === t.date)?.goal_fraction ?? 0;
        const { data, error } = await client.rpc('save_study_session', {
          p_id: t.id, p_revision: t.revision, p_duration: confirmedSeconds(t),
          p_started_at: new Date(t.startedAt).toISOString(), p_timezone: t.timezone,
          p_goal: t.goal, p_subject: t.subject || null, p_finalize: entry.finalize,
        });
        if (error) {
          if (['PGRST301', 'PGRST302', '42501'].includes(error.code)) this.retryAt = Infinity;
          throw error;
        }
        if (!live()) return;
        const receipt = data as SaveReceipt;
        if (receipt.session.user_id !== this.profile.id) throw new Error('Session account mismatch.');
        // A terminal receipt can be a response to a delayed checkpoint. Fetch
        // authoritative totals instead of counting a deleted row as new time.
        if (!receipt.summary && (receipt.session.deleted_at || receipt.session.finalized_at)) {
          const { data: summary, error } = await client.rpc('get_study_summary');
          if (error) throw error;
          if (!live()) return;
          receipt.summary = summary as StudySummary;
        }
        if (receipt.summary) {
          this.base = receipt.summary;
          for (const s of this.base.recent) this.known[s.id] = s;
        } else this.applyCheckpoint(receipt.session);
        this.known[id] = receipt.session;
        this.store = acknowledge(this.store, receipt.session);
        if ((receipt.session.finalized_at || receipt.session.deleted_at) && this.store.active?.id === id) {
          this.store = { ...this.store, active: null };
        }
        const awards = receipt.awards.filter((id) => !this.store.seenAwards.includes(id));
        const after = this.base.days.find((d) => d.session_date === t.date)?.goal_fraction ?? 0;
        const goal = before < 1 && after >= 1 && !this.store.celebratedDays.includes(t.date);
        this.store = { ...this.store, seenAwards: [...new Set([...this.store.seenAwards, ...awards])],
          celebratedDays: goal ? [...this.store.celebratedDays, t.date] : this.store.celebratedDays };
        // Consume the receipt and queue entry in one durable write, before celebrating.
        if (!this.persist()) return;
        if (awards.length || goal) this.celebration = { awards: [...new Set([...(this.celebration?.awards ?? []), ...awards])], goal: goal || !!this.celebration?.goal };
        this.error = null; this.attempts = 0; this.retryAt = 0; this.emit();
      }
    } catch (error) {
      if (live()) {
        this.error = error instanceof Error ? error.message : (error as { message?: string }).message ?? 'Could not sync. Your sessions are saved on this device.';
        if (this.retryAt !== Infinity) this.retryAt = Date.now() + Math.min(60_000, 1000 * 2 ** Math.min(this.attempts++, 6)) + Math.random() * 1000;
      }
    } finally { this.syncing = false; if (live()) this.emit(); }
  }
}
