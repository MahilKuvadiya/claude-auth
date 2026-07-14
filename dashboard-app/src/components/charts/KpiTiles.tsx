import {
  Activity, MessageSquare, Coins, DollarSign, Database, HardDrive,
  ArrowDownToLine, ArrowUpFromLine, Gauge, Clock, Users, CalendarDays, Percent, type LucideIcon,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { fmtNum, fmtUsd, fmtDuration } from '@/lib/utils';
import type { Summary } from '@/types';

const TINT: Record<string, string> = {
  teal: 'text-teal-700 bg-teal-50', sky: 'text-sky-600 bg-sky-50', indigo: 'text-indigo-600 bg-indigo-50',
  amber: 'text-amber-600 bg-amber-50', emerald: 'text-emerald-600 bg-emerald-50', rose: 'text-rose-600 bg-rose-50',
  slate: 'text-slate-600 bg-slate-100', violet: 'text-violet-600 bg-violet-50',
};

function Tile({ label, value, icon: Icon, tint }: { label: string; value: string; icon: LucideIcon; tint: string }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2">
        <span className={`grid h-7 w-7 place-items-center rounded-md ${TINT[tint] || TINT.slate}`}><Icon className="h-4 w-4" /></span>
        <span className="text-[.68rem] font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
      </div>
      <div className="mt-2 font-display text-2xl font-semibold text-foreground tabular-nums">{value}</div>
    </Card>
  );
}

export function KpiTiles({ data, isLoading, isAdmin }: { data?: Summary['totals']; isLoading?: boolean; isAdmin?: boolean }) {
  if (isLoading || !data) {
    return (
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
        {Array.from({ length: 12 }).map((_, i) => <Card key={i} className="p-4"><Skeleton h={54} /></Card>)}
      </div>
    );
  }
  const totalTokens = data.inputTokens + data.outputTokens + data.cacheReadTokens + data.cacheCreateTokens;
  const cacheRatio = totalTokens ? (data.cacheReadTokens / totalTokens) * 100 : 0;
  const avgTok = data.sessions ? totalTokens / data.sessions : 0;
  const avgMsg = data.sessions ? data.messages / data.sessions : 0;

  const tiles: { label: string; value: string; icon: LucideIcon; tint: string; adminOnly?: boolean }[] = [
    { label: 'Sessions', value: fmtNum(data.sessions), icon: Activity, tint: 'teal' },
    { label: 'Messages', value: fmtNum(data.messages), icon: MessageSquare, tint: 'sky' },
    { label: 'Total tokens', value: fmtNum(totalTokens), icon: Coins, tint: 'indigo' },
    { label: 'Est. cost', value: fmtUsd(data.costUsd), icon: DollarSign, tint: 'emerald' },
    { label: 'Cache-read', value: fmtNum(data.cacheReadTokens), icon: Database, tint: 'violet' },
    { label: 'Cache-create', value: fmtNum(data.cacheCreateTokens), icon: HardDrive, tint: 'amber' },
    { label: 'Input', value: fmtNum(data.inputTokens), icon: ArrowDownToLine, tint: 'sky' },
    { label: 'Output', value: fmtNum(data.outputTokens), icon: ArrowUpFromLine, tint: 'rose' },
    { label: 'Cache-read %', value: cacheRatio.toFixed(1) + '%', icon: Percent, tint: 'violet' },
    { label: 'Avg tokens/session', value: fmtNum(avgTok), icon: Gauge, tint: 'slate' },
    { label: 'Avg msgs/session', value: avgMsg.toFixed(1), icon: MessageSquare, tint: 'teal' },
    { label: 'Avg duration', value: fmtDuration(data.avgDurationMs), icon: Clock, tint: 'amber' },
    { label: 'Active users', value: fmtNum(data.activeUsers), icon: Users, tint: 'indigo', adminOnly: true },
    { label: 'Active days', value: fmtNum(data.activeDays), icon: CalendarDays, tint: 'emerald' },
  ].filter((t) => !t.adminOnly || isAdmin);

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
      {tiles.map((t) => <Tile key={t.label} {...t} />)}
    </div>
  );
}
