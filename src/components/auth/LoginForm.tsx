'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export function LoginForm({ callbackError }: { callbackError: boolean }) {
  const router = useRouter();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(callbackError ? 'That sign-in link could not be verified. Please try signing in again.' : '');
  const [message, setMessage] = useState('');
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(''); setMessage('');
    const form = new FormData(event.currentTarget);
    const email = String(form.get('email')).trim();
    const password = String(form.get('password'));
    try {
      const client = createClient();
      if (mode === 'signup') {
        const { data, error } = await client.auth.signUp({ email, password, options: { emailRedirectTo: `${window.location.origin}/auth/callback` } });
        if (error) throw error;
        if (!data.session) { setMessage('Check your email to confirm your account, then come back to your first session.'); return; }
      } else {
        const { error } = await client.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      router.replace('/');
      router.refresh();
    } catch (error) { setError(error instanceof Error ? error.message : 'Sign-in failed. Please try again.'); }
    finally { setBusy(false); }
  }
  async function google() {
    setBusy(true); setError('');
    try {
      const { error } = await createClient().auth.signInWithOAuth({ provider: 'google', options: { redirectTo: `${window.location.origin}/auth/callback` } });
      if (error) throw error;
    } catch (error) { setError(error instanceof Error ? error.message : 'Google sign-in is unavailable.'); setBusy(false); }
  }
  return <div className="w-full max-w-sm">
    <p className="eyebrow mb-3">Your next chapter</p>
    <h2 className="text-3xl tracking-tight">{mode === 'login' ? 'Welcome back.' : 'Start something good.'}</h2>
    <p className="mt-3 mb-8 text-sm text-muted">{mode === 'login' ? 'A little focus goes a long way.' : 'Your first day is a great place to start.'}</p>
    <button className="button secondary w-full" disabled={busy} onClick={google}><span aria-hidden="true" className="font-semibold">G</span> Continue with Google</button>
    <div className="my-6 flex items-center gap-4 text-xs text-muted"><span className="h-px flex-1 bg-line" />or use email<span className="h-px flex-1 bg-line" /></div>
    <form onSubmit={submit} className="space-y-5">
      <label className="field">Email address<input name="email" type="email" autoComplete="email" placeholder="you@example.com" required maxLength={254} /></label>
      <label className="field">Password<input name="password" type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={mode === 'signup' ? 8 : 1} required placeholder={mode === 'signup' ? 'At least 8 characters' : 'Your password'} /></label>
      {error && <p role="alert" className="notice error">{error}</p>}
      {message && <p role="status" className="notice">{message}</p>}
      <button className="button primary w-full" disabled={busy}>{busy ? 'One moment…' : mode === 'login' ? 'Sign in →' : 'Create account →'}</button>
    </form>
    <p className="mt-7 text-center text-sm text-muted">{mode === 'login' ? 'New here?' : 'Already have an account?'}{' '}
      <button className="text-accent underline-offset-4 hover:underline" disabled={busy} onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(''); setMessage(''); }}>{mode === 'login' ? 'Create an account' : 'Sign in'}</button>
    </p>
  </div>;
}
