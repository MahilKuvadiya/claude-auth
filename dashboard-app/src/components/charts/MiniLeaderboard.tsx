import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { fetchLeaderboard } from '@/api';
import { fmtNum, fmtUsd } from '@/lib/utils';

/** Top users by est. cost (elevated). */
export function MiniLeaderboard({ days, canDrill }: { days: number; canDrill?: boolean }) {
  const q = useQuery({ queryKey: ['leaderboard', days], queryFn: () => fetchLeaderboard(days) });
  const rows = (q.data ?? []).slice(0, 6);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Leaderboard</CardTitle>
        <Link to="/team" className="ml-auto text-[.78rem] text-primary no-underline hover:underline">View all →</Link>
      </CardHeader>
      <CardContent className="px-0 pb-2">
        {q.isLoading ? <div className="px-5 pb-4"><Skeleton h={160} /></div> : (
          <Table>
            <THead><TR><TH>User</TH><TH className="text-right">Sessions</TH><TH className="text-right">Tokens</TH><TH className="text-right">Cost</TH></TR></THead>
            <TBody>
              {rows.map((u) => (
                <TR key={u.email}>
                  <TD>
                    {canDrill
                      ? <Link to={`/sessions?user=${encodeURIComponent(u.email)}`} className="text-foreground no-underline hover:text-primary">{u.name}</Link>
                      : <span className="text-foreground">{u.name}</span>}
                    <span className="ml-1 text-[.72rem] text-muted-foreground">· {u.email}</span>
                  </TD>
                  <TD className="text-right tabular-nums">{u.sessions}</TD>
                  <TD className="text-right tabular-nums">{fmtNum(u.inputTokens + u.outputTokens + u.cacheReadTokens + u.cacheCreateTokens)}</TD>
                  <TD className="text-right tabular-nums">{fmtUsd(u.costUsd)}</TD>
                </TR>
              ))}
              {rows.length === 0 && <TR><TD className="py-6 text-center text-muted-foreground" colSpan={4}>No activity yet.</TD></TR>}
            </TBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
