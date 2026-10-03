import { confirmedSeconds, type TimerState } from './timer';
import { formatClock } from './time';

export const DEFAULT_TAB_TITLE = 'Chronostudy — Make your effort visible';

export function formatTabTitle(timer: TimerState): string {
  const clock = formatClock(confirmedSeconds(timer));
  const icon = timer.mode === 'paused' ? '⏸' : '⏱';
  return `${icon} ${clock} — Chronostudy`;
}
