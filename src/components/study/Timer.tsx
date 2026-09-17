'use client';
import { useState } from 'react';
import { confirmedSeconds } from '@/lib/timer';
import { formatClock, formatDuration } from '@/lib/time';
import type { ControllerSnapshot, StudyController } from '@/lib/study-controller';

export function Timer({ controller, snapshot }: { controller: StudyController; snapshot: ControllerSnapshot }) {
  const [subject, setSubject] = useState('');
  const timer = snapshot.store.active;
  const seconds = timer ? confirmedSeconds(timer) : 0;
  const running = timer?.mode === 'running';
  const disabled = !snapshot.ready || !snapshot.leader || snapshot.storageFailed;
  return <section className="flex flex-col items-center py-8 text-center sm:py-12" aria-labelledby="timer-title">
    <p className="eyebrow mb-2">{running ? 'One thing at a time' : timer ? 'Take the time you need' : 'A fresh moment to focus'}</p>
    <h1 id="timer-title" className="text-2xl tracking-tight sm:text-3xl">{running ? 'You’re making time for yourself.' : timer ? 'Your focus is right here.' : 'What will you make time for?'}</h1>
    <div className={`timer-dial ${running ? 'running' : ''}`}>
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 320 320" fill="none" aria-hidden="true">
        <circle cx="160" cy="160" r="142" stroke="var(--color-line)" strokeWidth="1" />
        {Array.from({ length: 60 }, (_, i) => {
          const angle = (i * 6 - 90) * Math.PI / 180;
          const outer = 132;
          const inner = i % 5 === 0 ? 121 : 127;
          // Trig rounding differs slightly between browser and server engines.
          const point = (radius: number, axis: 'x' | 'y') => (160 + (axis === 'x' ? Math.cos(angle) : Math.sin(angle)) * radius).toFixed(4);
          return <line key={i} x1={point(inner, 'x')} y1={point(inner, 'y')} x2={point(outer, 'x')} y2={point(outer, 'y')} stroke={i < (seconds / 60) % 60 ? 'var(--color-accent)' : 'var(--color-dial-tick)'} strokeWidth={i % 5 === 0 ? 2 : 1} />;
        })}
        <circle cx="160" cy="18" r="4" fill="var(--color-accent)" style={{ transformOrigin: '160px 160px', transform: `rotate(${(seconds / 60) % 60 * 6}deg)` }} />
      </svg>
      <div className="relative"><p className="mb-3 text-[10px] font-medium uppercase tracking-[0.24em] text-muted">{running ? 'In focus' : timer ? 'Paused' : 'Ready when you are'}</p><p role="timer" aria-label={`${formatDuration(seconds)} elapsed`} className="font-mono text-[43px] font-light tracking-[-0.065em] sm:text-5xl">{formatClock(seconds)}</p><p className="mt-4 text-xs text-muted">{timer?.subject || 'A little focus goes a long way'}</p></div>
    </div>
    <label className="field -mt-2 mb-6 w-64 text-left"><span className="sr-only">Subject, optional</span><input list="subjects" value={timer?.subject ?? subject} disabled={!!timer || disabled} onChange={(e) => setSubject(e.target.value)} maxLength={80} placeholder="＋ Add a subject (optional)" className="text-center" /><datalist id="subjects">{snapshot.summary.subjects.map((s) => <option key={s} value={s} />)}</datalist></label>
    <div className="flex gap-3">
      {!timer ? <button className="button primary min-w-52" disabled={disabled} onClick={() => controller.start(subject)}><span aria-hidden="true">▶</span> Start focusing</button>
        : <><button className="button primary min-w-36" disabled={disabled || timer.mode === 'review'} onClick={() => running ? controller.pause() : controller.resume()}>{running ? 'Ⅱ Pause' : '▶ Resume'}</button><button className="button secondary" disabled={disabled || timer.mode === 'review'} onClick={() => controller.stop()}>■ Finish</button></>}
    </div>
    {running && <p className="mt-5 max-w-sm text-xs leading-5 text-muted">Keep this tab open and work anywhere. Your timer keeps counting in the background.</p>}
    <p className="mt-5 max-w-sm text-xs leading-5 text-muted">{snapshot.status}</p>
  </section>;
}
