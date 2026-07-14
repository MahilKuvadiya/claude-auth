import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { AXIS_TICK, GRID_STROKE, REPORT_COLORS, TEAL_SCALE, ReportTooltip } from '@/lib/chart-theme';
import { fetchSessionThread } from '@/api';
import { fmtNum, fmtUsd, fmtDate, fmtDuration, shortProject } from '@/lib/utils';
import type { SessionMessage } from '@/types';

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[.66rem] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="font-display text-lg font-semibold tabular-nums text-foreground">{value}</div>
    </div>
  );
}

export function SessionThread() {
  const { id = '' } = useParams();
  const q = useQuery({ queryKey: ['session', id], queryFn: () => fetchSessionThread(id) });

  if (q.error) return <ErrorState error={(q.error as Error).message} retry={q.refetch} />;

  const s = q.data?.session;
  const msgs = q.data?.messages ?? [];
  const dur = s?.startedAt && s?.endedAt ? new Date(s.endedAt).getTime() - new Date(s.startedAt).getTime() : 0;
  const tokens = s ? s.inputTokens + s.outputTokens + s.cacheReadTokens + s.cacheCreateTokens : 0;
  const tools = new Set<string>();
  msgs.forEach((m) => m.toolNames.forEach((t) => tools.add(t)));
  // In-session token flow over TIME: cumulative + per-message deltas, x = elapsed minutes
  // from the session start (falls back to message index when timestamps are missing).
  const t0 = s?.startedAt ? new Date(s.startedAt).getTime() : (msgs[0]?.ts ? new Date(msgs[0].ts).getTime() : 0);
  let cum = 0;
  const flow = msgs.map((m, i) => {
    const delta = m.inputTokens + m.outputTokens + m.cacheReadTokens + m.cacheCreateTokens;
    cum += delta;
    const mins = m.ts && t0 ? Math.max(0, Math.round((new Date(m.ts).getTime() - t0) / 60000)) : i;
    return { t: mins, cumulative: cum, delta };
  });

  return (
    <>
      <div className="mb-4">
        <Link to="/sessions" className="inline-flex items-center gap-1 text-[.82rem] text-muted-foreground no-underline hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Sessions
        </Link>
      </div>

      {q.isLoading || !s ? <Card className="p-5"><Skeleton h={120} /></Card> : (
        <>
          <Card className="mb-4">
            <CardContent className="pt-4">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className="text-[.95rem] font-medium text-foreground">{s.userEmail}</span>
                <Badge tone="neutral">{shortProject(s.project)}</Badge>
                {s.gitBranch && <Badge tone="neutral">{s.gitBranch}</Badge>}
                {s.model && <Badge tone="accent">{s.model}</Badge>}
                <span className="ml-auto text-[.76rem] text-muted-foreground">{fmtDate(s.startedAt)}</span>
              </div>
              <div className="grid grid-cols-3 gap-4 sm:grid-cols-6">
                <Stat label="Messages" value={String(s.msgCount)} />
                <Stat label="Tokens" value={fmtNum(tokens)} />
                <Stat label="Cost" value={fmtUsd(s.costUsd)} />
                <Stat label="Duration" value={fmtDuration(dur)} />
                <Stat label="Cache-read" value={fmtNum(s.cacheReadTokens)} />
                <Stat label="Tools" value={String(tools.size)} />
              </div>
            </CardContent>
          </Card>

          {flow.length > 2 && (
            <Card className="mb-4">
              <CardHeader><CardTitle>Token flow over time</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={flow} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke={GRID_STROKE} strokeOpacity={0.6} />
                    <XAxis dataKey="t" type="number" tickFormatter={(v: number) => `${v}m`} tickLine={false} axisLine={false} tick={AXIS_TICK} />
                    <YAxis tickFormatter={(v: number) => fmtNum(v)} tickLine={false} axisLine={false} tick={AXIS_TICK} width={52} />
                    <Tooltip labelFormatter={(v) => `${v} min in`} content={<ReportTooltip valueFormatter={fmtNum} unit="tok" />} />
                    <Area type="monotone" dataKey="delta" name="Per message" stroke={TEAL_SCALE[2]} strokeWidth={0} fill={TEAL_SCALE[2]} fillOpacity={0.25} isAnimationActive={false} />
                    <Area type="monotone" dataKey="cumulative" name="Cumulative" stroke={REPORT_COLORS.deep} strokeWidth={2} fill={REPORT_COLORS.deep} fillOpacity={0.08} dot={false} isAnimationActive={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          <div className="flex flex-col gap-3">
            {msgs.map((m) => <Bubble key={m.uuid} m={m} />)}
          </div>
        </>
      )}
    </>
  );
}

function Bubble({ m }: { m: SessionMessage }) {
  const [open, setOpen] = useState(false);
  const isUser = m.role === 'user';
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[85%] rounded-lg border border-border p-3 ${isUser ? 'bg-accent' : 'bg-card'}`}>
        <div className="mb-1 flex items-center gap-2 text-[.66rem] uppercase tracking-wide text-muted-foreground">
          <span>{isUser ? 'User' : 'Assistant'}</span>
          {m.isSidechain && <Badge tone="neutral">sidechain</Badge>}
          {m.model && <span className="font-mono lowercase">{m.model}</span>}
          {(m.outputTokens > 0 || m.inputTokens > 0) && <span className="tabular-nums">· {fmtNum(m.inputTokens + m.outputTokens)} tok</span>}
        </div>
        {m.thinking && (
          <div className="mb-2">
            <button onClick={() => setOpen((o) => !o)} className="text-[.72rem] text-muted-foreground hover:text-foreground">
              {open ? '▾ hide thinking' : '▸ show thinking'}
            </button>
            {open && <pre className="mt-1 max-h-72 overflow-auto whitespace-pre-wrap rounded-md bg-muted p-2 text-[.78rem] text-muted-foreground">{m.thinking}</pre>}
          </div>
        )}
        {m.text && <div className="whitespace-pre-wrap break-words text-[.86rem] text-foreground">{m.text}</div>}
        {m.toolNames.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {m.toolNames.map((t, i) => <span key={i} className="rounded bg-muted px-1.5 py-[1px] font-mono text-[.7rem] text-muted-foreground">{t}</span>)}
          </div>
        )}
      </div>
    </div>
  );
}
