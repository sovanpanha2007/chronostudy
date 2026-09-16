import { describe, expect, it } from 'vitest';
import { addDays, resolveSessionDate } from './time';
import { buildCalendar, goalFractionToLevel } from './heatmap';

describe('permanent session dates', () => {
  it('uses the stored zone across midnight, independent of the device zone', () => {
    expect(resolveSessionDate(Date.parse('2026-09-15T16:40:00Z'), 'Asia/Phnom_Penh')).toBe('2026-09-15');
    expect(resolveSessionDate(Date.parse('2026-09-15T17:20:00Z'), 'Asia/Phnom_Penh')).toBe('2026-09-16');
  });
  it('handles both sides of daylight saving transitions', () => {
    for (const stamp of ['2026-03-08T06:59:00Z', '2026-03-08T07:01:00Z']) {
      expect(resolveSessionDate(Date.parse(stamp), 'America/New_York')).toBe('2026-03-08');
    }
    for (const stamp of ['2026-11-01T05:30:00Z', '2026-11-01T06:30:00Z']) {
      expect(resolveSessionDate(Date.parse(stamp), 'America/New_York')).toBe('2026-11-01');
    }
  });
  it('adds calendar days across a leap day', () => {
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
    expect(addDays('2024-02-28', 2)).toBe('2024-03-01');
  });
});

describe('goal-relative heatmap', () => {
  it.each([[0, 0], [0.001, 1], [0.249, 1], [0.25, 2], [0.5, 3], [0.75, 4], [0.999, 4], [1, 5], [3, 5]])
    ('maps fraction %s to level %s', (fraction, level) => expect(goalFractionToLevel(fraction)).toBe(level));
  it.each(['2026-09-13', '2026-09-16', '2026-09-19', '2024-02-29'])('shows exactly 365 unique days through %s', (today) => {
    const weeks = buildCalendar(today);
    const dates = weeks.flat().filter(Boolean);
    expect(weeks).toHaveLength(53);
    expect(dates).toHaveLength(365);
    expect(new Set(dates).size).toBe(365);
    expect(dates.at(-1)).toBe(today);
    expect(dates[0]).toBe(addDays(today, -364));
  });
});
