import { useState } from 'react';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import { ChartCard } from './ChartCard';
import { Segmented } from '@/components/ui/segmented';
import {
  AXIS_TICK, GRID_STROKE, CHART_HEIGHT, CHART_MARGIN, TEAL_SCALE, REPORT_COLORS, ChartState, ReportTooltip,
} from '@/lib/chart-theme';
import { fmtNum, fmtUsd, fmtDay } from '@/lib/utils';
import type { ActivityPoint } from '@/types';

type Metric = 'tokens' | 'cost' | 'sessions' | 'messages';
const OPTS = [
  { value: 'tokens' as Metric, label: 'Tokens' },
  { value: 'cost' as Metric, label: 'Cost' },
  { value: 'sessions' as Metric, label: 'Sessions' },
  { value: 'messages' as Metric, label: 'Messages' },
];

// The 4 token buckets, drawn as a stacked area (deepest teal = cache-read, the bulk).
const BUCKETS = [
  { key: 'cacheReadTokens', name: 'Cache read', color: TEAL_SCALE[5] },
  { key: 'cacheCreateTokens', name: 'Cache create', color: TEAL_SCALE[3] },
  { key: 'inputTokens', name: 'Input', color: TEAL_SCALE[2] },
  { key: 'outputTokens', name: 'Output', color: TEAL_SCALE[0] },
] as const;

export function TrendChart({ data, isLoading }: { data?: ActivityPoint[]; isLoading?: boolean }) {
  const [metric, setMetric] = useState<Metric>('tokens');
  const rows = data ?? [];
  const empty = !isLoading && rows.length === 0;

  return (
    <ChartCard title="Activity over time" subtitle="Daily usage across the selected range"
      right={<Segmented value={metric} onChange={setMetric} options={OPTS} />}>
      {isLoading || empty ? (
        <ChartState isLoading={isLoading} isEmpty={empty} />
      ) : (
        <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
          <AreaChart data={rows} margin={CHART_MARGIN}>
            <CartesianGrid vertical={false} stroke={GRID_STROKE} strokeOpacity={0.6} />
            <XAxis dataKey="date" tickFormatter={fmtDay} tickLine={false} axisLine={false} tick={AXIS_TICK} minTickGap={28} />
            <YAxis tickFormatter={(v: number) => (metric === 'cost' ? fmtUsd(v) : fmtNum(v))} tickLine={false} axisLine={false} tick={AXIS_TICK} width={52} />
            <Tooltip content={<ReportTooltip valueFormatter={(v) => (metric === 'cost' ? fmtUsd(v) : fmtNum(v))} />} />
            {metric === 'tokens' ? (
              <>
                <Legend iconType="circle" wrapperStyle={{ fontSize: 11, paddingTop: 6 }} />
                {BUCKETS.map((b) => (
                  <Area key={b.key} type="monotone" dataKey={b.key} name={b.name} stackId="t"
                    stroke={b.color} fill={b.color} fillOpacity={0.85} strokeWidth={0} isAnimationActive={false} />
                ))}
              </>
            ) : (
              <Area type="monotone"
                dataKey={metric === 'cost' ? 'costUsd' : metric}
                name={metric === 'cost' ? 'Cost' : metric === 'sessions' ? 'Sessions' : 'Messages'}
                stroke={REPORT_COLORS.deep} strokeWidth={2} fill={REPORT_COLORS.deep} fillOpacity={0.1}
                dot={false} isAnimationActive={false} />
            )}
          </AreaChart>
        </ResponsiveContainer>
      )}
    </ChartCard>
  );
}
