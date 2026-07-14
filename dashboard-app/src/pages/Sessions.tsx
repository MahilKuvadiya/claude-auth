import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import type { ColumnDef } from '@tanstack/react-table';
import { PageHeader } from '@/components/layout/AppShell';
import { Card } from '@/components/ui/card';
import { DataTable } from '@/components/ui/data-table';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { ErrorState } from '@/components/ui/states';
import { fetchLeaderboard, fetchSessions } from '@/api';
import { sessionColumns } from './sessionColumns';
import { fmtNum, fmtUsd } from '@/lib/utils';
import type { UserRow } from '@/types';

const tokens = (u: UserRow) => u.inputTokens + u.outputTokens + u.cacheReadTokens + u.cacheCreateTokens;

const userColumns: ColumnDef<UserRow, unknown>[] = [
  { header: 'User', accessorKey: 'name', cell: ({ row }) => <span className="text-foreground">{row.original.name}<span className="ml-1 text-[.72rem] text-muted-foreground">· {row.original.email}</span></span> },
  { header: 'Role', accessorKey: 'role', cell: ({ row }) => <Badge tone={row.original.role === 'admin' ? 'accent' : row.original.role === 'pod_lead' ? 'success' : 'neutral'}>{row.original.role}</Badge> },
  { header: 'Sessions', accessorKey: 'sessions', meta: { align: 'right' }, cell: ({ row }) => row.original.sessions },
  { header: 'Messages', accessorKey: 'messages', meta: { align: 'right' }, cell: ({ row }) => fmtNum(row.original.messages) },
  { header: 'Tokens', accessorFn: (u) => tokens(u), meta: { align: 'right' }, cell: ({ row }) => fmtNum(tokens(row.original)) },
  { header: 'Cost', accessorKey: 'costUsd', meta: { align: 'right' }, cell: ({ row }) => fmtUsd(row.original.costUsd) },
];

export function Sessions() {
  const [sp] = useSearchParams();
  const user = sp.get('user');
  // Pure routing — no hooks here, so each child has a stable hook order.
  return user ? <UserSessions email={user} /> : <SessionUsers />;
}

function SessionUsers() {
  const nav = useNavigate();
  // Level 1 — list every user; click drills into their sessions.
  const q = useQuery({ queryKey: ['session-users'], queryFn: () => fetchLeaderboard(365) });
  return (
    <>
      <PageHeader title="Sessions" subtitle="Pick a user to view their sessions" />
      {q.error ? <ErrorState error={(q.error as Error).message} retry={q.refetch} />
        : q.isLoading ? <Card className="p-5"><Skeleton h={320} /></Card>
          : (
            <Card>
              <DataTable columns={userColumns} data={q.data ?? []} pageSize={15}
                initialSort={[{ id: 'costUsd', desc: true }]}
                onRowClick={(u) => nav(`/sessions?user=${encodeURIComponent(u.email)}`)}
                empty="No users have synced sessions yet." />
            </Card>
          )}
    </>
  );
}

function UserSessions({ email }: { email: string }) {
  const q = useQuery({ queryKey: ['sessions', email], queryFn: () => fetchSessions({ user: email, sort: 'recent', limit: 200 }) });
  return (
    <>
      <div className="mb-3">
        <Link to="/sessions" className="inline-flex items-center gap-1 text-[.82rem] text-muted-foreground no-underline hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> All users
        </Link>
      </div>
      <PageHeader title={email} subtitle={q.data ? `${q.data.total} sessions` : 'Sessions'} />
      {q.error ? <ErrorState error={(q.error as Error).message} retry={q.refetch} />
        : q.isLoading ? <Card className="p-5"><Skeleton h={320} /></Card>
          : (
            <Card>
              <DataTable columns={sessionColumns} data={q.data?.sessions ?? []} pageSize={15}
                empty="No sessions for this user." />
            </Card>
          )}
    </>
  );
}
