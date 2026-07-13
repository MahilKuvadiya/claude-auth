import { useQuery } from '@tanstack/react-query';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { ChartCard } from './ChartCard';
import { fetchBreakdown, type BreakdownDim } from '@/api';
import { AXIS_TICK, GRID_STROKE, REPORT_COLORS, CategoryTick, ChartState, ReportTooltip } from '@/lib/chart-theme';
import { fmtNum, fmtUsd, shortProject } from '@/lib/utils';

/** Horizontal top-N bar chart for a dimension. valueKey picks cost vs a raw count. */
export function BarBreakdown({ by, days, title, subtitle, valueKey = 'costUsd', unit }:
  { by: BreakdownDim; days: number; title: string; subtitle?: string; valueKey?: 'costUsd' | 'count' | 'tokens'; unit?: string }) {
  const q = useQuery({ queryKey: ['breakdown', by, days], queryFn: () => fetchBreakdown(by, days) });
  const rows = (q.data ?? [])
    .map((i) => ({ key: by === 'project' ? shortProject(i.key) : i.key, value: Number((i as Record<string, unknown>)[valueKey] ?? 0) }))
    .filter((r) => r.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);
  const empty = !q.isLoading && rows.length === 0;
  const fmt = valueKey === 'costUsd' ? fmtUsd : fmtNum;

  return (
    <ChartCard title={title} subtitle={subtitle}>
      {q.isLoading || empty ? <ChartState isLoading={q.isLoading} isEmpty={empty} /> : (
        <ResponsiveContainer width="100%" height={Math.max(180, rows.length * 34)}>
          <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
            <CartesianGrid horizontal={false} stroke={GRID_STROKE} strokeOpacity={0.6} />
            <XAxis type="number" tickFormatter={(v: number) => fmt(v)} tickLine={false} axisLine={false} tick={AXIS_TICK} />
            <YAxis type="category" dataKey="key" width={128} tickLine={false} axisLine={false} tick={<CategoryTick />} />
            <Tooltip cursor={{ fill: 'var(--muted)', opacity: 0.4 }} content={<ReportTooltip unit={unit} valueFormatter={(v) => fmt(v)} />} />
            <Bar dataKey="value" name={title} radius={[0, 3, 3, 0]} maxBarSize={26} fill={REPORT_COLORS.deep} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </ChartCard>
  );
}
