import { useAuth, isAdmin, isElevated } from '@/auth';
import { useRange } from '@/lib/useRange';
import { PageHeader } from '@/components/layout/AppShell';
import { RangeFilter } from '@/components/layout/RangeFilter';
import { AnalyticsSections } from '@/components/AnalyticsSections';
import { MiniLeaderboard } from '@/components/charts/MiniLeaderboard';
import { TopSessionsTable } from '@/components/charts/TopSessionsTable';

export function Overview() {
  const { role } = useAuth();
  const [days, setDays] = useRange();
  const admin = isAdmin(role);
  const elevated = isElevated(role);
  const scopeLabel = admin ? 'the whole team' : role === 'pod_lead' ? 'your pod' : 'you';

  return (
    <>
      <PageHeader title="Overview" subtitle={`Claude Code analytics for ${scopeLabel}`}
        right={<RangeFilter value={days} onChange={setDays} />} />
      <AnalyticsSections days={days} admin={admin} />
      {(elevated || admin) && (
        <div className="mt-4 space-y-4">
          {elevated && <MiniLeaderboard days={days} canDrill={admin} />}
          {admin && <TopSessionsTable days={days} />}
        </div>
      )}
    </>
  );
}
