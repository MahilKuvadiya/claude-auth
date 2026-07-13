import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import { useAuth, isAdmin } from '@/auth';
import { useRange } from '@/lib/useRange';
import { PageHeader } from '@/components/layout/AppShell';
import { RangeFilter } from '@/components/layout/RangeFilter';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { DataTable } from '@/components/ui/data-table';
import { ErrorState } from '@/components/ui/states';
import { fetchLeaderboard } from '@/api';
import { fmtNum, fmtUsd } from '@/lib/utils';
import type { UserRow } from '@/types';

const tokens = (u: UserRow) => u.inputTokens + u.outputTokens + u.cacheReadTokens + u.cacheCreateTokens;

const columns: ColumnDef<UserRow, unknown>[] = [
  { header: 'User', accessorKey: 'name', cell: ({ row }) => <span className="text-foreground">{row.original.name}<span className="ml-1 text-[.72rem] text-muted-foreground">· {row.original.email}</span></span> },
  { header: 'Role', accessorKey: 'role', cell: ({ row }) => <Badge tone={row.original.role === 'admin' ? 'accent' : row.original.role === 'pod_lead' ? 'success' : 'neutral'}>{row.original.role}</Badge> },
  { header: 'Sessions', accessorKey: 'sessions', meta: { align: 'right' }, cell: ({ row }) => row.original.sessions },
  { header: 'Messages', accessorKey: 'messages', meta: { align: 'right' }, cell: ({ row }) => fmtNum(row.original.messages) },
  { header: 'Tokens', accessorFn: (u) => tokens(u), id: 'tokens', meta: { align: 'right' }, cell: ({ row }) => fmtNum(tokens(row.original)) },
  { header: 'Cost', accessorKey: 'costUsd', meta: { align: 'right' }, cell: ({ row }) => fmtUsd(row.original.costUsd) },
];

export function Leaderboard() {
  const { role } = useAuth();
  const admin = isAdmin(role);
  const [days, setDays] = useRange();
  const nav = useNavigate();
  const q = useQuery({ queryKey: ['leaderboard', days], queryFn: () => fetchLeaderboard(days) });

  return (
    <>
      <PageHeader title="Leaderboard" subtitle={admin ? 'Everyone, ranked — click a user for their analytics' : 'Your pod, ranked'}
        right={<RangeFilter value={days} onChange={setDays} />} />
      {q.error ? <ErrorState error={(q.error as Error).message} retry={q.refetch} />
        : q.isLoading ? <Card className="p-5"><Skeleton h={320} /></Card>
          : (
            <Card>
              <DataTable columns={columns} data={q.data ?? []} pageSize={15}
                initialSort={[{ id: 'costUsd', desc: true }]}
                onRowClick={(u) => nav(`/users/${encodeURIComponent(u.email)}`)}
                empty="No activity in this range yet." />
            </Card>
          )}
    </>
  );
}
