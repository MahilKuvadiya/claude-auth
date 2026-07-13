import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { fetchSessions } from '../api';
import { GlassPanel, Skeleton, ErrorState, EmptyState } from '../components/glass';

const fmt = (n: number) => (n >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'k' : String(n));
const usd = (n: number) => '$' + n.toFixed(2);
const when = (s?: string | null) => (s ? new Date(s).toLocaleString() : '—');

export function Sessions() {
  const [sp] = useSearchParams();
  const initialUser = sp.get('user') ?? '';
  const [user, setUser] = useState(initialUser);
  const [project, setProject] = useState('');
  const [applied, setApplied] = useState({ user: initialUser, project: '' });

  const q = useQuery({
    queryKey: ['sessions', applied],
    queryFn: () => fetchSessions({ user: applied.user || undefined, project: applied.project || undefined, limit: 100 }),
  });

  return (
    <>
      <GlassPanel className="mb-4 flex flex-wrap items-center gap-2 p-[14px_18px]" spec={false}>
        <h1 className="m-0 mr-2 text-[1.15rem] font-semibold tracking-[-.02em]">Sessions</h1>
        <input value={user} onChange={(e) => setUser(e.target.value)} placeholder="filter by email"
          className="rounded-lg border border-hairline bg-surface px-3 py-[7px] text-[.82rem] text-ink outline-none" />
        <input value={project} onChange={(e) => setProject(e.target.value)} placeholder="filter by project"
          className="rounded-lg border border-hairline bg-surface px-3 py-[7px] text-[.82rem] text-ink outline-none" />
        <button onClick={() => setApplied({ user: user.trim(), project: project.trim() })}
          className="rounded-lg px-3 py-[7px] text-[.82rem]" style={{ background: 'var(--accent-wash)', color: 'var(--accent)' }}>
          Apply
        </button>
        <span className="flex-1" />
        {q.data && <span className="text-[.78rem] text-ink-faint">{q.data.total} total</span>}
      </GlassPanel>

      {q.error && <ErrorState error={(q.error as Error).message} retry={q.refetch} />}
      {q.isLoading && <GlassPanel className="p-[18px]"><Skeleton h={280} /></GlassPanel>}

      {q.data && q.data.sessions.length === 0 && (
        <EmptyState title="No sessions" hint="No sessions match this filter yet." />
      )}

      {q.data && q.data.sessions.length > 0 && (
        <GlassPanel className="overflow-hidden p-0">
          <table className="w-full border-collapse text-[.84rem]">
            <thead>
              <tr className="text-left text-[.7rem] uppercase tracking-wide text-ink-faint">
                <th className="p-[12px_16px] font-medium">User</th>
                <th className="p-[12px_16px] font-medium">Project</th>
                <th className="p-[12px_16px] font-medium">Model</th>
                <th className="p-[12px_16px] font-medium">Started</th>
                <th className="p-[12px_16px] text-right font-medium">Msgs</th>
                <th className="p-[12px_16px] text-right font-medium">Tokens</th>
                <th className="p-[12px_16px] text-right font-medium">Cost</th>
              </tr>
            </thead>
            <tbody>
              {q.data.sessions.map((s) => (
                <tr key={s.id} className="border-t border-hairline hover:bg-[var(--surface)]">
                  <td className="p-[10px_16px]">
                    <Link to={`/sessions/${s.id}`} className="text-ink no-underline hover:text-white">{s.userEmail}</Link>
                  </td>
                  <td className="p-[10px_16px] text-ink-soft">{s.project ? s.project.split('/').pop() : '—'}</td>
                  <td className="p-[10px_16px] font-mono text-[.74rem] text-ink-faint">{s.model ?? '—'}</td>
                  <td className="p-[10px_16px] text-ink-faint">{when(s.startedAt)}</td>
                  <td className="p-[10px_16px] text-right tabular-nums">{s.msgCount}</td>
                  <td className="p-[10px_16px] text-right tabular-nums">{fmt(s.inputTokens + s.outputTokens + s.cacheReadTokens + s.cacheCreateTokens)}</td>
                  <td className="p-[10px_16px] text-right tabular-nums">{usd(s.costUsd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </GlassPanel>
      )}
    </>
  );
}
