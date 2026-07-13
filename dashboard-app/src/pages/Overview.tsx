import { useQuery } from '@tanstack/react-query';
import { useAuth, isAdmin, isElevated } from '@/auth';
import { useRange } from '@/lib/useRange';
import { PageHeader } from '@/components/layout/AppShell';
import { RangeFilter } from '@/components/layout/RangeFilter';
import { KpiTiles } from '@/components/charts/KpiTiles';
import { TrendChart } from '@/components/charts/TrendChart';
import { Donut } from '@/components/charts/Donut';
import { BarBreakdown } from '@/components/charts/BarBreakdown';
import { TimeDistribution } from '@/components/charts/TimeDistribution';
import { MiniLeaderboard } from '@/components/charts/MiniLeaderboard';
import { TopSessionsTable } from '@/components/charts/TopSessionsTable';
import { ErrorState } from '@/components/ui/states';
import { fetchSummary, fetchActivity } from '@/api';

export function Overview() {
  const { role } = useAuth();
  const [days, setDays] = useRange();
  const admin = isAdmin(role);
  const elevated = isElevated(role);
  const scopeLabel = admin ? 'the whole team' : role === 'pod_lead' ? 'your pod' : 'you';

  const summary = useQuery({ queryKey: ['summary', days], queryFn: () => fetchSummary(days) });
  const activity = useQuery({ queryKey: ['activity', days], queryFn: () => fetchActivity(days) });

  return (
    <>
      <PageHeader title="Overview" subtitle={`Claude Code analytics for ${scopeLabel}`}
        right={<RangeFilter value={days} onChange={setDays} />} />

      {summary.error ? <ErrorState error={(summary.error as Error).message} retry={summary.refetch} /> : (
        <div className="space-y-4">
          <KpiTiles data={summary.data?.totals} isLoading={summary.isLoading} isAdmin={admin} />
          <TrendChart data={activity.data} isLoading={activity.isLoading} />
          <div className="grid gap-4 lg:grid-cols-2">
            <Donut by="model" days={days} title="By model" subtitle="Cost share by model" />
            <BarBreakdown by="project" days={days} title="Top projects" subtitle="By est. cost" valueKey="costUsd" />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <BarBreakdown by="tool" days={days} title="Tool usage" subtitle="tool_use calls" valueKey="count" unit="calls" />
            <TimeDistribution days={days} />
          </div>
          {elevated && <MiniLeaderboard days={days} canDrill={admin} />}
          {admin && <TopSessionsTable days={days} />}
        </div>
      )}
    </>
  );
}
