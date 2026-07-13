import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useAuth, isAdmin } from '@/auth';
import { useRange } from '@/lib/useRange';
import { PageHeader } from '@/components/layout/AppShell';
import { RangeFilter } from '@/components/layout/RangeFilter';
import { Card } from '@/components/ui/card';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/states';
import { fetchLeaderboard } from '@/api';
import { fmtNum, fmtUsd } from '@/lib/utils';
import type { UserRow } from '@/types';

type Col = { key: keyof UserRow; label: string; num?: boolean; fmt?: (r: UserRow) => string };
const tokens = (r: UserRow) => r.inputTokens + r.outputTokens + r.cacheReadTokens + r.cacheCreateTokens;

export function Leaderboard() {
  const { role } = useAuth();
  const admin = isAdmin(role);
  const [days, setDays] = useRange();
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 }>({ key: 'costUsd', dir: -1 });
  const q = useQuery({ queryKey: ['leaderboard', days], queryFn: () => fetchLeaderboard(days) });

  const cols: Col[] = [
    { key: 'name', label: 'User' },
    { key: 'role', label: 'Role' },
    { key: 'sessions', label: 'Sessions', num: true, fmt: (r) => String(r.sessions) },
    { key: 'messages', label: 'Messages', num: true, fmt: (r) => fmtNum(r.messages) },
    { key: 'inputTokens', label: 'Tokens', num: true, fmt: (r) => fmtNum(tokens(r)) },
    { key: 'costUsd', label: 'Est. cost', num: true, fmt: (r) => fmtUsd(r.costUsd) },
  ];
  const val = (r: UserRow, k: string) => (k === 'inputTokens' ? tokens(r) : (r as Record<string, unknown>)[k]);
  const rows = [...(q.data ?? [])].sort((a, b) => {
    const x = val(a, sort.key), y = val(b, sort.key);
    if (typeof x === 'number' && typeof y === 'number') return (x - y) * sort.dir;
    return String(x).localeCompare(String(y)) * sort.dir;
  });
  const click = (k: string) => setSort((s) => (s.key === k ? { key: k, dir: (s.dir * -1) as 1 | -1 } : { key: k, dir: -1 }));

  return (
    <>
      <PageHeader title="Leaderboard" subtitle={admin ? 'Everyone, ranked' : 'Your pod, ranked'}
        right={<RangeFilter value={days} onChange={setDays} />} />
      {q.isLoading ? <Card className="p-5"><Skeleton h={280} /></Card>
        : rows.length === 0 ? <EmptyState title="No activity" hint="No usage in this range yet." />
          : (
            <Card>
              <Table>
                <THead><TR>
                  {cols.map((c) => (
                    <TH key={c.key} className={c.num ? 'text-right' : ''}>
                      <button onClick={() => click(c.key)} className="inline-flex items-center gap-1 hover:text-foreground">
                        {c.label}
                        {sort.key === c.key && (sort.dir === -1 ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />)}
                      </button>
                    </TH>
                  ))}
                </TR></THead>
                <TBody>
                  {rows.map((u) => (
                    <TR key={u.email}>
                      <TD>
                        {admin
                          ? <Link to={`/sessions?user=${encodeURIComponent(u.email)}`} className="text-foreground no-underline hover:text-primary">{u.name}</Link>
                          : <span className="text-foreground">{u.name}</span>}
                        <span className="ml-1 text-[.72rem] text-muted-foreground">· {u.email}</span>
                      </TD>
                      <TD><Badge tone={u.role === 'admin' ? 'accent' : u.role === 'pod_lead' ? 'success' : 'neutral'}>{u.role}</Badge></TD>
                      <TD className="text-right tabular-nums">{u.sessions}</TD>
                      <TD className="text-right tabular-nums">{fmtNum(u.messages)}</TD>
                      <TD className="text-right tabular-nums">{fmtNum(tokens(u))}</TD>
                      <TD className="text-right tabular-nums">{fmtUsd(u.costUsd)}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </Card>
          )}
    </>
  );
}
