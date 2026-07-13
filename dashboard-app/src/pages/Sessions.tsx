import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@/components/layout/AppShell';
import { Card } from '@/components/ui/card';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { Select } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { fetchSessions } from '@/api';
import { fmtNum, fmtUsd, fmtDate, shortProject } from '@/lib/utils';

const SORTS = [
  { value: 'recent', label: 'Most recent' },
  { value: 'cost', label: 'Highest cost' },
  { value: 'tokens', label: 'Most tokens' },
  { value: 'msgs', label: 'Most messages' },
];

export function Sessions() {
  const [sp] = useSearchParams();
  const [user, setUser] = useState(sp.get('user') ?? '');
  const [project, setProject] = useState('');
  const [sort, setSort] = useState('recent');
  const [applied, setApplied] = useState({ user: sp.get('user') ?? '', project: '', sort: 'recent' });

  const q = useQuery({
    queryKey: ['sessions', applied],
    queryFn: () => fetchSessions({ user: applied.user || undefined, project: applied.project || undefined, sort: applied.sort, limit: 100 }),
  });
  const apply = () => setApplied({ user: user.trim(), project: project.trim(), sort });

  return (
    <>
      <PageHeader title="Sessions" subtitle="Every synced Claude Code session (admin)" />
      <Card className="mb-4 flex flex-wrap items-center gap-2 p-3">
        <input value={user} onChange={(e) => setUser(e.target.value)} placeholder="filter by email"
          className="h-9 rounded-md border border-border bg-card px-3 text-[.85rem] text-foreground outline-none focus:ring-2 focus:ring-ring" />
        <input value={project} onChange={(e) => setProject(e.target.value)} placeholder="filter by project"
          className="h-9 rounded-md border border-border bg-card px-3 text-[.85rem] text-foreground outline-none focus:ring-2 focus:ring-ring" />
        <Select value={sort} onValueChange={setSort} options={SORTS} className="w-40" />
        <Button size="sm" onClick={apply}>Apply</Button>
        <span className="flex-1" />
        {q.data && <span className="text-[.78rem] text-muted-foreground">{q.data.total} total</span>}
      </Card>

      {q.error ? <ErrorState error={(q.error as Error).message} retry={q.refetch} />
        : q.isLoading ? <Card className="p-5"><Skeleton h={320} /></Card>
          : q.data && q.data.sessions.length === 0 ? <EmptyState title="No sessions" hint="No sessions match this filter." />
            : (
              <Card>
                <Table>
                  <THead><TR>
                    <TH>User</TH><TH>Project</TH><TH>Model</TH><TH>Started</TH>
                    <TH className="text-right">Msgs</TH><TH className="text-right">Tokens</TH><TH className="text-right">Cost</TH>
                  </TR></THead>
                  <TBody>
                    {q.data!.sessions.map((s) => (
                      <TR key={s.id}>
                        <TD><Link to={`/sessions/${s.id}`} className="text-foreground no-underline hover:text-primary">{s.userEmail}</Link></TD>
                        <TD className="text-muted-foreground">{shortProject(s.project)}</TD>
                        <TD className="font-mono text-[.74rem] text-muted-foreground">{s.model ?? '—'}</TD>
                        <TD className="text-muted-foreground">{fmtDate(s.startedAt)}</TD>
                        <TD className="text-right tabular-nums">{s.msgCount}</TD>
                        <TD className="text-right tabular-nums">{fmtNum(s.inputTokens + s.outputTokens + s.cacheReadTokens + s.cacheCreateTokens)}</TD>
                        <TD className="text-right tabular-nums">{fmtUsd(s.costUsd)}</TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </Card>
            )}
    </>
  );
}
