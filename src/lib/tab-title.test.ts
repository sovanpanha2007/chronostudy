import { describe, expect, it } from 'vitest';
import { DEFAULT_TAB_TITLE, formatTabTitle } from './tab-title';
import { newTimer } from './timer';
import type { Profile } from './types';

const profile: Profile = { id: 'user-a', display_name: 'Student', timezone: 'Asia/Phnom_Penh', daily_goal_minutes: 60, onboarded_at: '2026-09-15' };
const start = Date.parse('2026-09-15T16:40:00Z');
const timer = (confirmedMs: number, mode: 'running' | 'paused' | 'review' = 'running') =>
  ({ ...newTimer(profile, 'Math', start, '00000000-0000-4000-8000-000000000001'), confirmedMs, mode });

describe('tab title', () => {
  it('shows the stopwatch and elapsed time while running', () => {
    expect(formatTabTitle(timer(253_000))).toBe('⏱ 00:04:13 — Chronostudy');
  });
  it('shows the pause icon while paused', () => {
    expect(formatTabTitle(timer(253_000, 'paused'))).toBe('⏸ 00:04:13 — Chronostudy');
  });
  it('shows the stopwatch while in review', () => {
    expect(formatTabTitle(timer(253_000, 'review'))).toBe('⏱ 00:04:13 — Chronostudy');
  });
  it('formats hours past one hour', () => {
    expect(formatTabTitle(timer(3_723_000))).toBe('⏱ 01:02:03 — Chronostudy');
  });
  it('exposes the default title for restoring the tab', () => {
    expect(DEFAULT_TAB_TITLE).toBe('Chronostudy — Make your effort visible');
  });
});
