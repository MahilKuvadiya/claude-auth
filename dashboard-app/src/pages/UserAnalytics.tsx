import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useAuth, isAdmin } from '@/auth';
import { useRange } from '@/lib/useRange';
import { PageHeader } from '@/components/layout/AppShell';
import { RangeFilter } from '@/components/layout/RangeFilter';
import { AnalyticsSections } from '@/components/AnalyticsSections';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DataTable } from '@/components/ui/data-table';
import { Skeleton } from '@/components/ui/skeleton';
import { fetchSessions } from '@/api';
import { sessionColumns } from './sessionColumns';

/** All of one user's analytics (drill-down from the leaderboard). */
export function UserAnalytics() {
  const { email = '' } = useParams();
  const { role } = useAuth();
  const admin = isAdmin(role);
  const [days, setDays] = useRange();

  const sessions = useQuery({
    queryKey: ['user-sessions', email, days],
    queryFn: () => fetchSessions({ user: email, sort: 'recent', limit: 200, from: new Date(Date.now() - days * 864e5).toISOString() }),
    enabled: admin, // sessions are admin-only
  });

  return (
    <>
      <div className="mb-3">
        <Link to="/team" className="inline-flex items-center gap-1 text-[.82rem] text-muted-foreground no-underline hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Leaderboard
        </Link>
      </div>
      <PageHeader title={email} subtitle="Individual analytics"
        right={<RangeFilter value={days} onChange={setDays} />} />

      <AnalyticsSections days={days} user={email} admin={admin} />

      {admin && (
        <Card className="mt-4">
          <CardHeader><CardTitle>Sessions</CardTitle></CardHeader>
          <CardContent className="px-0 pb-2">
            {sessions.isLoading ? <div className="px-5 pb-4"><Skeleton h={200} /></div>
              : <DataTable columns={sessionColumns} data={sessions.data?.sessions ?? []} pageSize={10} empty="No sessions in range." />}
          </CardContent>
        </Card>
      )}
    </>
  );
}
