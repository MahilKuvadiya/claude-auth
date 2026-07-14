import { useQuery } from '@tanstack/react-query';
import { KpiTiles } from '@/components/charts/KpiTiles';
import { TrendChart } from '@/components/charts/TrendChart';
import { Donut } from '@/components/charts/Donut';
import { BarBreakdown } from '@/components/charts/BarBreakdown';
import { TimeDistribution } from '@/components/charts/TimeDistribution';
import { ErrorState } from '@/components/ui/states';
import { fetchSummary, fetchActivity } from '@/api';

/** The full analytics chart stack, optionally scoped to one `user`. Shared by the
    Overview and the per-user drill-down. */
export function AnalyticsSections({ days, user, admin }: { days: number; user?: string; admin?: boolean }) {
  const summary = useQuery({ queryKey: ['summary', days, user], queryFn: () => fetchSummary(days, user) });
  const activity = useQuery({ queryKey: ['activity', days, user], queryFn: () => fetchActivity(days, user) });

  if (summary.error) return <ErrorState error={(summary.error as Error).message} retry={summary.refetch} />;

  return (
    <div className="space-y-4">
      <KpiTiles data={summary.data?.totals} isLoading={summary.isLoading} isAdmin={admin && !user} />
      <TrendChart data={activity.data} isLoading={activity.isLoading} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Donut by="model" days={days} user={user} title="By model" subtitle="Cost share by model" />
        <BarBreakdown by="project" days={days} user={user} title="Top projects" subtitle="By est. cost" valueKey="costUsd" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <BarBreakdown by="tool" days={days} user={user} title="Tool usage" subtitle="tool_use calls" valueKey="count" unit="calls" />
        <TimeDistribution days={days} user={user} />
      </div>
    </div>
  );
}
