import { addDays } from './time';

export function goalFractionToLevel(fraction: number): 0 | 1 | 2 | 3 | 4 | 5 {
  if (fraction <= 0) return 0;
  if (fraction < 0.25) return 1;
  if (fraction < 0.5) return 2;
  if (fraction < 0.75) return 3;
  if (fraction < 1) return 4;
  return 5;
}

export function buildCalendar(today: string): (string | null)[][] {
  const weekday = new Date(`${today}T12:00:00Z`).getUTCDay();
  const first = addDays(today, -weekday - 52 * 7);
  const cutoff = addDays(today, -364);
  return Array.from({ length: 53 }, (_, week) =>
    Array.from({ length: 7 }, (_, day) => {
      const date = addDays(first, week * 7 + day);
      return date < cutoff || date > today ? null : date;
    }),
  );
}
