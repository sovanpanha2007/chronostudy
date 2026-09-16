'use client';
import { useEffect, useMemo, useRef } from 'react';
import { buildCalendar, goalFractionToLevel } from '@/lib/heatmap';
import { dateLabel, formatDuration } from '@/lib/time';
import type { DayTotal } from '@/lib/types';

export function Heatmap({ today, days, onDay }: { today: string; days: DayTotal[]; onDay: (date: string) => void }) {
  const container = useRef<HTMLDivElement>(null);
  const weeks = useMemo(() => buildCalendar(today), [today]);
  const totals = new Map(days.map((day) => [day.session_date, day]));
  const filled = weeks.flat().filter((date) => date && (totals.get(date)?.total_seconds ?? 0) > 0).length;
  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const showToday = () => { element.scrollLeft = element.scrollWidth; };
    showToday();
    const observer = new ResizeObserver(showToday);
    observer.observe(element);
    return () => observer.disconnect();
  }, [today]);
  function navigate(event: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    const deltas: Record<string, number> = { ArrowLeft: -7, ArrowRight: 7, ArrowUp: -1, ArrowDown: 1 };
    if (!(event.key in deltas)) return;
    event.preventDefault();
    const button = container.current?.querySelector<HTMLButtonElement>(`[data-index="${index + deltas[event.key]}"]`);
    if (button) { event.currentTarget.tabIndex = -1; button.tabIndex = 0; button.focus(); }
  }
  return <section className="panel" aria-labelledby="heatmap-title">
    <div className="mb-7 flex flex-wrap items-end justify-between gap-3"><div><p className="eyebrow mb-2">Every little bit adds up</p><h2 id="heatmap-title" className="text-xl tracking-tight">Your year in focus</h2></div><p className="text-sm text-muted"><span className="text-foreground">{filled}</span> {filled === 1 ? 'day' : 'days'} of showing up</p></div>
    <div ref={container} className="heatmap-scroll" aria-label="Study calendar for the last 365 days. Use arrow keys to explore days.">
      <div className="heatmap-calendar">
        <div className="heatmap-labels" aria-hidden="true"><span /><span /><span>Mon</span><span /><span>Wed</span><span /><span>Fri</span><span /></div>
        {weeks.map((week, w) => {
          const first = week.find((d) => d !== null);
          const previous = weeks[w - 1]?.find((d) => d !== null);
          const month = first && (!previous || first.slice(0, 7) !== previous.slice(0, 7))
            ? new Intl.DateTimeFormat('en', { month: 'short', timeZone: 'UTC' }).format(new Date(`${first}T12:00:00Z`)) : '';
          return <div key={w} className="heatmap-week"><span aria-hidden="true" className="month-label">{month}</span>
            {week.map((date, d) => {
              if (!date) return <span key={d} className="heatmap-empty" />;
              const total = totals.get(date);
              const fraction = total?.goal_fraction ?? 0;
              const label = `${dateLabel(date)}: ${formatDuration(total?.total_seconds ?? 0)}, ${Math.round(fraction * 100)}% of goal`;
              return <button key={date} data-index={w * 7 + d} tabIndex={date === today ? 0 : -1} aria-label={label} title={label}
                onKeyDown={(event) => navigate(event, w * 7 + d)} onClick={() => onDay(date)}
                className={`heatmap-cell heat-${goalFractionToLevel(fraction)} ${date === today ? 'is-today' : ''}`} />;
            })}</div>;
        })}
      </div>
    </div>
    <div className="mt-5 flex flex-wrap items-center justify-between gap-4 text-xs text-muted"><p>One square. One day. Your own pace.</p><div className="flex items-center gap-1.5"><span className="mr-1">Less</span>{[0, 1, 2, 3, 4, 5].map((level) => <span key={level} aria-hidden="true" className={`h-3 w-3 rounded-[3px] heat-${level}`} />)}<span className="ml-1">Goal met</span></div></div>
  </section>;
}
