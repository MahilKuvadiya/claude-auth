import { useQuery } from '@tanstack/react-query';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts';
import { ChartCard } from './ChartCard';
import { fetchBreakdown, type BreakdownDim } from '@/api';
import { tealSpread, ChartState, ReportTooltip } from '@/lib/chart-theme';
import { fmtUsd } from '@/lib/utils';

/** Cost-weighted donut for a categorical dimension (e.g. model). */
export function Donut({ by, days, title, subtitle, user }: { by: BreakdownDim; days: number; title: string; subtitle?: string; user?: string }) {
  const q = useQuery({ queryKey: ['breakdown', by, days, user], queryFn: () => fetchBreakdown(by, days, user) });
  const items = (q.data ?? []).filter((i) => (i.costUsd ?? 0) > 0).slice(0, 8);
  const colors = tealSpread(Math.max(items.length, 1));
  const total = items.reduce((s, i) => s + (i.costUsd ?? 0), 0);
  const empty = !q.isLoading && items.length === 0;

  return (
    <ChartCard title={title} subtitle={subtitle}>
      {q.isLoading || empty ? <ChartState isLoading={q.isLoading} isEmpty={empty} /> : (
        <div className="flex items-center gap-4">
          <ResponsiveContainer width="55%" height={220}>
            <PieChart>
              <Pie data={items} dataKey="costUsd" nameKey="key" cx="50%" cy="50%" innerRadius={58} outerRadius={88} paddingAngle={1.5} isAnimationActive={false}>
                {items.map((_, i) => <Cell key={i} fill={colors[i]} stroke="var(--card)" strokeWidth={2} />)}
              </Pie>
              <Tooltip content={<ReportTooltip valueFormatter={fmtUsd} />} />
            </PieChart>
          </ResponsiveContainer>
          <ul className="flex-1 space-y-1.5">
            {items.map((it, i) => (
              <li key={it.key} className="flex items-center gap-2 text-[.8rem]">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: colors[i] }} />
                <span className="truncate text-foreground">{it.key}</span>
                <span className="ml-auto shrink-0 tabular-nums text-muted-foreground">{fmtUsd(it.costUsd ?? 0)}</span>
              </li>
            ))}
            <li className="mt-1 flex items-center gap-2 border-t border-border pt-1.5 text-[.8rem] font-medium">
              <span className="text-muted-foreground">Total</span>
              <span className="ml-auto tabular-nums">{fmtUsd(total)}</span>
            </li>
          </ul>
        </div>
      )}
    </ChartCard>
  );
}
