import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { ChartCard } from './ChartCard';
import { Segmented } from '@/components/ui/segmented';
import { fetchBreakdown } from '@/api';
import { AXIS_TICK, GRID_STROKE, REPORT_COLORS, ChartState, ReportTooltip } from '@/lib/chart-theme';
import { fmtNum } from '@/lib/utils';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Session activity distributed across hour-of-day or weekday. */
export function TimeDistribution({ days }: { days: number }) {
  const [mode, setMode] = useState<'hour' | 'weekday'>('hour');
  const q = useQuery({ queryKey: ['breakdown', mode, days], queryFn: () => fetchBreakdown(mode, days) });

  const base = mode === 'hour'
    ? Array.from({ length: 24 }, (_, h) => ({ key: String(h), label: `${h}:00`, sessions: 0 }))
    : WEEKDAYS.map((label, i) => ({ key: String(i), label, sessions: 0 }));
  for (const it of q.data ?? []) {
    const row = base.find((b) => b.key === String(it.key));
    if (row) row.sessions = it.sessions ?? 0;
  }
  const empty = !q.isLoading && !(q.data ?? []).length;

  return (
    <ChartCard title="When work happens" subtitle="Sessions by time"
      right={<Segmented value={mode} onChange={setMode} options={[{ value: 'hour', label: 'Hour' }, { value: 'weekday', label: 'Weekday' }]} />}>
      {q.isLoading || empty ? <ChartState isLoading={q.isLoading} isEmpty={empty} /> : (
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={base} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke={GRID_STROKE} strokeOpacity={0.6} />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tick={AXIS_TICK} interval={mode === 'hour' ? 2 : 0} />
            <YAxis allowDecimals={false} tickFormatter={(v: number) => fmtNum(v)} tickLine={false} axisLine={false} tick={AXIS_TICK} width={36} />
            <Tooltip cursor={{ fill: 'var(--muted)', opacity: 0.4 }} content={<ReportTooltip unit="sessions" />} />
            <Bar dataKey="sessions" name="Sessions" radius={[3, 3, 0, 0]} maxBarSize={mode === 'hour' ? 18 : 40} fill={REPORT_COLORS.primary} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </ChartCard>
  );
}
