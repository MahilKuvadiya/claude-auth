import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { AreaChart, Area, ResponsiveContainer, XAxis, Tooltip } from 'recharts';
import { watchMembers, fetchRollups, createJoinLink, listJoinLinks, revokeMember } from '../api';
import type { Member } from '../types';
import { GlassPanel, Card, Button, Pill, Meter, Skeleton, ErrorState, EmptyState, GlassModal } from '../components/glass';

const fmt = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : `${n}`);

export function PoolDetail() {
  const { poolId = '' } = useParams();
  const [members, setMembers] = useState<Member[] | null>(null);
  const [memErr, setMemErr] = useState<string | null>(null);
  const [invite, setInvite] = useState(false);

  // realtime members
  useEffect(() => watchMembers(poolId, setMembers, (e) => setMemErr(e.message)), [poolId]);

  const rollups = useQuery({ queryKey: ['rollups', poolId], queryFn: () => fetchRollups(poolId) });
  const links = useQuery({ queryKey: ['links', poolId], queryFn: () => listJoinLinks(poolId) });

  const totals = (rollups.data ?? []).reduce(
    (a, r) => ({ tin: a.tin + r.tokensIn, tout: a.tout + r.tokensOut, cr: a.cr + r.cacheRead, cw: a.cw + r.cacheWrite, req: a.req + r.requests }),
    { tin: 0, tout: 0, cr: 0, cw: 0, req: 0 },
  );
  const cacheEff = totals.cr + totals.cw + totals.tin > 0 ? Math.round((totals.cr / (totals.cr + totals.cw + totals.tin)) * 100) : 0;
  const chart = (rollups.data ?? []).map((r) => ({ d: r.id.slice(5), cacheRead: r.cacheRead, output: r.tokensOut, input: r.tokensIn }));

  return (
    <>
      <GlassPanel className="mb-4 flex items-center gap-3 p-[14px_18px]" spec={false}>
        <Link to="/" className="text-ink-faint no-underline">←</Link>
        <h1 className="m-0 text-[1.15rem] font-semibold tracking-[-.02em]">Pool</h1>
        <span className="font-mono text-[.8rem] text-ink-faint">{poolId}</span>
        <span className="flex-1" />
        <Button onClick={() => setInvite(true)}>+ Generate join link</Button>
      </GlassPanel>

      {/* KPI tiles from real rollups */}
      <div className="mb-4 grid grid-cols-4 gap-4">
        <Tile label="Tokens · 14d" value={rollups.isLoading ? '…' : fmt(totals.tin + totals.tout + totals.cr)} />
        <Tile label="Requests" value={rollups.isLoading ? '…' : fmt(totals.req)} />
        <Tile label="Cache eff." value={rollups.isLoading ? '…' : `${cacheEff}%`} />
        <Tile label="Members" value={members ? members.filter((m) => m.status !== 'revoked').length : '…'} />
      </div>

      <div className="mb-4 grid grid-cols-[1.5fr_1fr] gap-4">
        <Card>
          <div className="mb-3 text-[1rem] font-semibold">Token usage</div>
          {rollups.isLoading ? <Skeleton h={150} />
            : rollups.error ? <ErrorState error={(rollups.error as Error).message} retry={rollups.refetch} />
            : chart.length === 0 ? <EmptyState title="No usage yet" hint="Usage appears once members serve requests through the pool." />
            : (
              <ResponsiveContainer width="100%" height={170}>
                <AreaChart data={chart}>
                  <defs>
                    <linearGradient id="ca" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--accent)" stopOpacity={0.8} /><stop offset="1" stopColor="var(--accent)" stopOpacity={0.25} /></linearGradient>
                  </defs>
                  <XAxis dataKey="d" tick={{ fontSize: 11, fill: 'var(--ink-faint)' }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ background: 'var(--surface-2)', border: '1px solid var(--hairline)', borderRadius: 12, fontSize: 12 }} />
                  <Area type="monotone" dataKey="cacheRead" stroke="var(--accent-deep)" fill="url(#ca)" />
                  <Area type="monotone" dataKey="output" stroke="var(--accent-lite)" fill="transparent" />
                </AreaChart>
              </ResponsiveContainer>
            )}
        </Card>
        <Card>
          <div className="mb-3 text-[1rem] font-semibold">Cache efficiency</div>
          <div className="grid h-[150px] place-items-center">
            <div className="text-center">
              <div className="text-[2.4rem] tnum" style={{ color: 'var(--accent)' }}>{cacheEff}%</div>
              <div className="text-[.82rem] text-ink-soft">served warm from the shared org cache</div>
            </div>
          </div>
        </Card>
      </div>

      {/* Members — realtime, with anytime link generation + revoke */}
      <Card>
        <div className="mb-3 flex items-center justify-between">
          <div className="text-[1rem] font-semibold">Members</div>
          <Button variant="ghost" onClick={() => setInvite(true)}>+ Add member</Button>
        </div>
        {memErr && <ErrorState error={memErr} />}
        {!members && !memErr && <Skeleton h={80} />}
        {members && members.length === 0 && (
          <EmptyState title="No members yet" hint="Generate a targeted join link and send it to a teammate."
            action={<Button onClick={() => setInvite(true)}>+ Generate join link</Button>} />
        )}
        {members && members.length > 0 && (
          <table className="w-full border-collapse text-[.86rem]">
            <thead>
              <tr className="text-left font-mono text-[.66rem] uppercase tracking-[.08em] text-ink-faint">
                <th className="pb-3">Member</th><th className="pb-3">Status</th><th className="pb-3">Headroom · 5h</th><th className="pb-3" />
              </tr>
            </thead>
            <tbody>
              {members.map((m) => <MemberRow key={m.id} poolId={poolId} m={m} onChange={() => {}} />)}
            </tbody>
          </table>
        )}
      </Card>

      {/* pending join links */}
      {links.data && links.data.length > 0 && (
        <Card className="mt-4">
          <div className="mb-3 text-[1rem] font-semibold">Join links</div>
          {links.data.map((l) => (
            <div key={l.joinToken} className="flex items-center gap-3 border-t border-hairline py-3 first:border-t-0">
              <span className="text-[.85rem]">{l.targetEmail}</span>
              {l.used ? <Pill>used</Pill> : <Pill>pending</Pill>}
              <code className="ml-auto font-mono text-[.78rem] text-ink-soft">{l.command}</code>
              <CopyBtn text={l.command} />
            </div>
          ))}
        </Card>
      )}

      {invite && <InviteModal poolId={poolId} onClose={() => { setInvite(false); links.refetch(); }} />}
    </>
  );
}

function Tile({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <GlassPanel className="p-[18px]">
      <div className="font-mono text-[.66rem] uppercase tracking-[.1em] text-accent">{label}</div>
      <div className="mt-[10px] text-[1.7rem] tracking-[-.03em] tnum">{value}</div>
    </GlassPanel>
  );
}

function MemberRow({ poolId, m }: { poolId: string; m: Member; onChange: () => void }) {
  const revoke = useMutation({ mutationFn: () => revokeMember(poolId, m.id) });
  const head = m.rateLimit?.fiveHourPct ?? null;
  return (
    <tr>
      <td className="border-t border-hairline py-3">
        <div className="font-medium">{m.email ?? m.id}</div>
      </td>
      <td className="border-t border-hairline py-3">
        <span className="inline-flex items-center gap-[6px] text-[.78rem]">
          <i className="h-[7px] w-[7px] rounded-full" style={{ background: m.status === 'resting' ? 'var(--warn)' : m.status === 'revoked' ? 'var(--ink-faint)' : 'var(--accent)' }} />
          {m.status}
        </span>
      </td>
      <td className="border-t border-hairline py-3">
        {head === null ? <span className="text-ink-faint">—</span> : <><Meter pct={head} warn={head > 80} /> <span className="ml-2 tnum">{head}%</span></>}
      </td>
      <td className="border-t border-hairline py-3 text-right">
        {m.status !== 'revoked' && (
          <Button variant="danger" onClick={() => revoke.mutate()} disabled={revoke.isPending}>
            {revoke.isPending ? '…' : 'Revoke'}
          </Button>
        )}
      </td>
    </tr>
  );
}

function InviteModal({ poolId, onClose }: { poolId: string; onClose: () => void }) {
  const [email, setEmail] = useState('');
  const m = useMutation({ mutationFn: () => createJoinLink(poolId, email.trim()) });
  return (
    <GlassModal title="Generate a join link" onClose={onClose}>
      <p className="mb-4 text-[.88rem] text-ink-soft">The link works once and only for this exact email.</p>
      <label className="mb-1 block text-[.82rem] text-ink-soft">Teammate email</label>
      <input autoFocus value={email} onChange={(e) => setEmail(e.target.value)} placeholder="teammate@devxlabs.ai"
        className="mb-4 w-full rounded-xl border border-hairline bg-surface px-3 py-[11px] text-[.92rem] text-ink outline-none" />
      {m.error && <div className="mb-3 text-[.84rem]" style={{ color: 'var(--warn)' }}>{(m.error as Error).message}</div>}
      {m.data ? (
        <div className="rounded-xl border border-hairline bg-surface p-3">
          <div className="mb-2 text-[.8rem] text-ink-soft">Send this to {email}:</div>
          <div className="flex items-center gap-2">
            <code className="flex-1 font-mono text-[.82rem]">{m.data.command}</code>
            <CopyBtn text={m.data.command} />
          </div>
        </div>
      ) : (
        <Button disabled={!email.trim() || m.isPending} onClick={() => m.mutate()}>
          {m.isPending ? 'Generating…' : 'Generate link'}
        </Button>
      )}
    </GlassModal>
  );
}

function CopyBtn({ text }: { text: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button className="rounded-lg px-[9px] py-[5px] font-mono text-[.72rem]" style={{ background: 'var(--accent-wash)', color: 'var(--accent)' }}
      onClick={() => { navigator.clipboard?.writeText(text); setOk(true); setTimeout(() => setOk(false), 1300); }}>
      {ok ? 'Copied' : 'Copy'}
    </button>
  );
}
