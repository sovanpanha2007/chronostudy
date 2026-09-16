'use client';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Profile, StudySummary } from '@/lib/types';
import { Modal } from '@/components/ui/Modal';
import { GOALS } from '@/lib/goals';

export function SettingsModal({ profile, onClose, onSaved, onSignOut }: { profile: Profile; onClose: () => void; onSaved: (profile: Profile, summary: StudySummary) => void; onSignOut: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError('');
    const form = new FormData(event.currentTarget);
    try {
      const client = createClient();
      const { data, error } = await client.rpc('update_study_profile', { p_name: String(form.get('name')), p_goal: Number(form.get('goal')), p_timezone: String(form.get('timezone')).trim(), p_complete_onboarding: false });
      if (error) throw error;
      const { data: summary, error: summaryError } = await client.rpc('get_study_summary');
      if (summaryError) throw summaryError;
      onSaved(data as Profile, summary as StudySummary); onClose();
    } catch (error) { setError((error as { message?: string }).message ?? 'Could not save your settings.'); }
    finally { setBusy(false); }
  }
  return <Modal title="Make this space yours" onClose={busy ? undefined : onClose}><form className="space-y-5" onSubmit={save}>
    <label className="field">Name<input name="name" required maxLength={40} defaultValue={profile.display_name} autoComplete="nickname" /></label>
    <label className="field">Daily study goal<select name="goal" defaultValue={profile.daily_goal_minutes}>{GOALS.map((g) => <option key={g.minutes} value={g.minutes}>{g.label}</option>)}</select></label>
    <label className="field">Time zone<input name="timezone" defaultValue={profile.timezone} required list="timezones" /><datalist id="timezones">{Intl.supportedValuesOf('timeZone').map((zone) => <option key={zone} value={zone} />)}<option value="UTC" /></datalist></label>
    <p className="text-xs leading-5 text-muted">Changes apply to new sessions. Your past sessions keep their original day and goal.</p>
    {error && <p role="alert" className="notice error">{error}</p>}
    <button className="button primary w-full" disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button>
  </form><div className="mt-6 border-t border-line pt-5"><button className="text-sm text-muted hover:text-foreground" disabled={busy} onClick={onSignOut}>Sign out →</button></div></Modal>;
}
