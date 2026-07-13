import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { fetchSummary, fetchActivity, fetchLeaderboard } from '../api';
import { useAuth, isElevated, isAdmin } from '../auth';
import { GlassPanel, Card, StatTile, Skeleton, ErrorState } from '../components/glass';

const fmt = (n: number) => (n >= 1e9 ? (n / 1e9).toFixed(2) + 'B' : n >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'k' : String(n));
const usd = (n: number) => '$' + (n >= 1000 ? n.toFixed(0) : n.toFixed(2));

const RANGES = [7, 30, 90] as const;

export function Analytics() {
  const { role } = useAuth();
  const [days, setDays] = useState<number>(30);
  const elevated = isElevated(role);
  const admin = isAdmin(role);

  const summary = useQuery({ queryKey: ['summary', days], queryFn: () => fetchSummary(days) });
  const activity = useQuery({ queryKey: ['activity', days], queryFn: () => fetchActivity(days) });
  const board = useQuery({ queryKey: ['leaderboard', days], queryFn: () => fetchLeaderboard(days), enabled: elevated });

  const t = summary.data?.totals;
  const scopeLabel = role === 'admin' ? 'the whole team' : role === 'pod_lead' ? 'your pod' : 'you';

  return (
    <>
      <GlassPanel className="mb-4 flex items-center gap-3 p-[14px_18px]" spec={false}>
        <h1 className="m-0 text-[1.15rem] font-semibold tracking-[-.02em]">Analytics</h1>
        <span className="text-[.8rem] text-ink-faint">· {scopeLabel}</span>
        <span className="flex-1" />
        <div className="flex gap-1">
          {RANGES.map((d) => (
            <button key={d} onClick={() => setDays(d)}
              className="rounded-lg px-3 py-[6px] text-[.8rem]"
              style={days === d ? { background: 'var(--accent-wash)', color: 'var(--accent)' } : { color: 'var(--ink-soft)' }}>
              {d}d
            </button>
          ))}
        </div>
      </GlassPanel>

      {summary.error && <ErrorState error={(summary.error as Error).message} retry={summary.refetch} />}

      <div className="mb-4 grid grid-cols-4 gap-4">
        {summary.isLoading || !t ? (
          RANGES.concat(4 as never).slice(0, 4).map((_, i) => <Card key={i}><Skeleton h={54} /></Card>)
        ) : (
          <>
            <StatTile label="Sessions" value={fmt(t.sessions)} />
            <StatTile label="Messages" value={fmt(t.messages)} />
            <StatTile label="Total tokens" value={fmt(t.inputTokens + t.outputTokens + t.cacheReadTokens + t.cacheCreateTokens)} />
            <StatTile label="Est. cost" value={usd(t.costUsd)} />
          </>
        )}
      </div>

      <GlassPanel className="mb-4 p-[18px]">
        <div className="mb-3 text-[.9rem] font-semibold text-ink">Daily tokens</div>
        {activity.isLoading ? <Skeleton h={220} /> : (
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={activity.data ?? []} margin={{ top: 6, right: 8, left: -8, bottom: 0 }}>
              <defs>
                <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.5} />
                  <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--hairline)" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--ink-faint)' }} tickFormatter={(d: string) => d.slice(5)} minTickGap={24} />
              <YAxis tick={{ fontSize: 11, fill: 'var(--ink-faint)' }} tickFormatter={fmt} width={44} />
              <Tooltip contentStyle={{ background: 'var(--surface)', border: '1px solid var(--hairline)', borderRadius: 12, fontSize: 12 }}
                formatter={(v: number) => [fmt(v), 'tokens']} />
              <Area type="monotone" dataKey="tokens" stroke="var(--accent)" strokeWidth={2} fill="url(#g)" />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </GlassPanel>

      {elevated && (
        <GlassPanel className="p-[18px]">
          <div className="mb-3 flex items-center gap-2">
            <div className="text-[.9rem] font-semibold text-ink">Leaderboard</div>
            <span className="text-[.75rem] text-ink-faint">by est. cost</span>
          </div>
          {board.isLoading ? <Skeleton h={160} /> : (
            <table className="w-full border-collapse text-[.85rem]">
              <thead>
                <tr className="text-left text-[.72rem] uppercase tracking-wide text-ink-faint">
                  <th className="pb-2 font-medium">User</th>
                  <th className="pb-2 text-right font-medium">Sessions</th>
                  <th className="pb-2 text-right font-medium">Tokens</th>
                  <th className="pb-2 text-right font-medium">Cost</th>
                </tr>
              </thead>
              <tbody>
                {(board.data ?? []).map((u) => (
                  <tr key={u.email} className="border-t border-hairline">
                    <td className="py-[9px]">
                      {admin ? (
                        <Link to={`/sessions?user=${encodeURIComponent(u.email)}`} className="text-ink no-underline hover:text-white">
                          {u.name} <span className="text-ink-faint">· {u.email}</span>
                        </Link>
                      ) : (
                        <span className="text-ink">{u.name} <span className="text-ink-faint">· {u.email}</span></span>
                      )}
                    </td>
                    <td className="py-[9px] text-right tabular-nums">{u.sessions}</td>
                    <td className="py-[9px] text-right tabular-nums">{fmt(u.inputTokens + u.outputTokens + u.cacheReadTokens + u.cacheCreateTokens)}</td>
                    <td className="py-[9px] text-right tabular-nums">{usd(u.costUsd)}</td>
                  </tr>
                ))}
                {(board.data ?? []).length === 0 && (
                  <tr><td colSpan={4} className="py-6 text-center text-ink-faint">No activity in this range yet.</td></tr>
                )}
              </tbody>
            </table>
          )}
        </GlassPanel>
      )}
    </>
  );
}
