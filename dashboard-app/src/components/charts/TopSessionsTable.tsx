import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { fetchSessions } from '@/api';
import { fmtNum, fmtUsd, shortProject } from '@/lib/utils';

/** Most expensive sessions in range (admin-only — uses the sessions endpoint). */
export function TopSessionsTable({ days }: { days: number }) {
  const from = new Date(Date.now() - days * 864e5).toISOString();
  const q = useQuery({
    queryKey: ['top-sessions', days],
    queryFn: () => fetchSessions({ sort: 'cost', limit: 8, from }),
  });
  const rows = q.data?.sessions ?? [];
  return (
    <Card>
      <CardHeader><CardTitle>Top sessions by cost</CardTitle></CardHeader>
      <CardContent className="px-0 pb-2">
        {q.isLoading ? <div className="px-5 pb-4"><Skeleton h={180} /></div> : (
          <Table>
            <THead><TR>
              <TH>User</TH><TH>Project</TH><TH>Model</TH>
              <TH className="text-right">Msgs</TH><TH className="text-right">Tokens</TH><TH className="text-right">Cost</TH>
            </TR></THead>
            <TBody>
              {rows.map((s) => (
                <TR key={s.id}>
                  <TD><Link to={`/sessions/${s.id}`} className="text-foreground no-underline hover:text-primary">{s.userEmail}</Link></TD>
                  <TD className="text-muted-foreground">{shortProject(s.project)}</TD>
                  <TD className="font-mono text-[.74rem] text-muted-foreground">{s.model ?? '—'}</TD>
                  <TD className="text-right tabular-nums">{s.msgCount}</TD>
                  <TD className="text-right tabular-nums">{fmtNum(s.inputTokens + s.outputTokens + s.cacheReadTokens + s.cacheCreateTokens)}</TD>
                  <TD className="text-right tabular-nums">{fmtUsd(s.costUsd)}</TD>
                </TR>
              ))}
              {rows.length === 0 && <TR><TD className="py-6 text-center text-muted-foreground" colSpan={6}>No sessions in range.</TD></TR>}
            </TBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
