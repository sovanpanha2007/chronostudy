'use client';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { createClient } from '@/lib/supabase/client';
import { GOALS } from '@/lib/goals';
import { Brand } from '@/components/Brand';

const PURPOSES = ['Exam prep', 'Coursework', 'Personal learning', 'Professional certification', 'Language learning', 'Other'];
const STARTS = ['Already study consistently', 'Building a new habit', 'Getting back into it after a break'];

export function Onboarding() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [purpose, setPurpose] = useState('');
  const [starting, setStarting] = useState('');
  const [goal, setGoal] = useState(60);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const reduced = useReducedMotion();
  // Focus a newly mounted step, without refocusing on each form update.
  const focusHeading = useCallback((node: HTMLHeadingElement | null) => {
    node?.focus();
  }, []);
  useEffect(() => {
    if (step !== 5) return;
    const timeout = setTimeout(() => { router.replace('/app'); router.refresh(); }, 1400);
    return () => clearTimeout(timeout);
  }, [step, router]);
  async function finish() {
    setBusy(true); setError('');
    try {
      const { error } = await createClient().rpc('update_study_profile', {
        p_name: name.trim() || `Learner ${Math.floor(1000 + Math.random() * 9000)}`,
        p_goal: goal, p_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        p_complete_onboarding: true,
      });
      if (error) throw error;
      setStep(5);
    } catch (error) { setError(error instanceof Error ? error.message : (error as { message?: string }).message ?? 'Could not save your profile. Please try again.'); }
    finally { setBusy(false); }
  }
  const titles = ['A little time. A lasting difference.', 'What are you making time for?', 'Where are you starting from?', 'Make a little room for focus.', 'What should we call you?', 'You’re set. Let’s begin.'];
  const descriptions = ['Your effort adds up. Chronostudy gives it a place to live.', 'There’s no wrong reason to keep learning.', 'We’ll meet you right where you are.', `${purpose && purpose !== 'Other' ? `Make room for ${purpose.toLowerCase()}.` : 'Choose a daily study goal.'} ${starting === 'Building a new habit' ? 'Start small; you can grow from here.' : 'You can change it anytime.'}`, 'A name to make this space yours. You can skip this.', starting === 'Getting back into it after a break' ? 'Welcome back to making time for yourself. Start wherever you are.' : 'Your first session is the start of something.'];
  return <main id="main" className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-6 py-8">
    <Brand />
    <div className="mx-auto my-auto w-full max-w-lg py-16">
      {step > 0 && step < 5 && <div aria-label={`Step ${step} of 4`} className="mb-10 flex gap-2">{[1, 2, 3, 4].map((s) => <span key={s} className={`h-1 w-8 rounded-full ${s <= step ? 'bg-accent' : 'bg-line'}`} />)}</div>}
      <AnimatePresence initial={false} mode="wait"><motion.div key={step} initial={reduced ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <p className="eyebrow mb-4">{step === 5 ? 'Welcome to chronostudy' : 'Your space, your pace'}</p>
        <h1 tabIndex={-1} ref={focusHeading} className="text-4xl leading-tight tracking-tight outline-none">{titles[step]}</h1>
        <p className="mt-4 mb-9 leading-7 text-muted">{descriptions[step]}</p>
        {step === 0 && <button className="button primary" onClick={() => setStep(1)}>Make a start →</button>}
        {(step === 1 || step === 2) && <div className="grid gap-3">{(step === 1 ? PURPOSES : STARTS).map((option) => <button key={option} className="choice text-left" onClick={() => { if (step === 1) setPurpose(option); else setStarting(option); setStep(step + 1); }} aria-pressed={step === 1 ? purpose === option : starting === option}>{option}<span aria-hidden="true">↗</span></button>)}</div>}
        {step === 3 && <><div className="grid grid-cols-2 gap-3">{GOALS.map((option) => <button key={option.minutes} className={`choice flex-col items-start ${goal === option.minutes ? 'selected' : ''}`} aria-pressed={goal === option.minutes} onClick={() => setGoal(option.minutes)}><span className="text-xl">{option.label}</span><span className="text-xs text-muted">{option.minutes === 60 ? 'Recommended' : 'Every day'}</span></button>)}</div><button className="button primary mt-7 w-full" onClick={() => setStep(4)}>That feels right →</button></>}
        {step === 4 && <form onSubmit={(e) => { e.preventDefault(); void finish(); }}><label className="field">Your name<input value={name} onChange={(e) => setName(e.target.value)} placeholder="A name or nickname" maxLength={40} autoComplete="nickname" /></label>{error && <p role="alert" className="notice error mt-4">{error}</p>}<button disabled={busy} className="button primary mt-7 w-full">{busy ? 'Getting your space ready…' : name.trim() ? 'Let’s begin →' : 'Skip and begin →'}</button></form>}
        {step === 5 && <a href="/app" className="button primary">Log your first session →</a>}
      </motion.div></AnimatePresence>
      {step > 0 && step < 5 && <button className="mt-7 text-sm text-muted hover:text-foreground" disabled={busy} onClick={() => setStep(step - 1)}>← Back</button>}
    </div>
  </main>;
}
