import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Plus } from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { PageHeader } from '@/components/layout/AppShell';
import { Card } from '@/components/ui/card';
import { ChartCard } from '@/components/charts/ChartCard';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Modal } from '@/components/ui/dialog';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { AXIS_TICK, GRID_STROKE, TEAL_SCALE, ReportTooltip } from '@/lib/chart-theme';
import { fetchMembers, fetchRollups, listJoinLinks, revokeMember, createJoinLink } from '@/api';
import { fmtNum } from '@/lib/utils';
import type { Member, TokenTally } from '@/types';

const sumTally = (t?: TokenTally) => (t?.tokensIn ?? 0) + (t?.tokensOut ?? 0) + (t?.cacheRead ?? 0) + (t?.cacheWrite ?? 0);

function Tile({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <Card className="p-4">
      <div className="text-[.66rem] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1.5 font-display text-2xl font-semibold tabular-nums text-foreground">{value}</div>
    </Card>
  );
}

export function PoolDetail() {
  const { poolId = '' } = useParams();
  const [invite, setInvite] = useState(false);
  const membersQ = useQuery({ queryKey: ['members', poolId], queryFn: () => fetchMembers(poolId), refetchInterval: 10_000 });
  const rollups = useQuery({ queryKey: ['rollups', poolId], queryFn: () => fetchRollups(poolId) });
  const links = useQuery({ queryKey: ['links', poolId], queryFn: () => listJoinLinks(poolId) });
  const members = membersQ.data ?? null;

  const totals = (rollups.data ?? []).reduce(
    (a, r) => ({ tin: a.tin + r.tokensIn, tout: a.tout + r.tokensOut, cr: a.cr + r.cacheRead, cw: a.cw + r.cacheWrite, req: a.req + r.requests }),
    { tin: 0, tout: 0, cr: 0, cw: 0, req: 0 });
  const cacheEff = totals.cr + totals.cw + totals.tin > 0 ? Math.round((totals.cr / (totals.cr + totals.cw + totals.tin)) * 100) : 0;
  const chart = (rollups.data ?? []).map((r) => ({ d: r.id.slice(5), cacheRead: r.cacheRead, output: r.tokensOut }));

  return (
    <>
      <div className="mb-3"><Link to="/pools" className="inline-flex items-center gap-1 text-[.82rem] text-muted-foreground no-underline hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Pools</Link></div>
      <PageHeader title="Pool" subtitle={poolId}
        right={<Button onClick={() => setInvite(true)}><Plus className="h-4 w-4" /> Join link</Button>} />

      <div className="mb-4 grid grid-cols-2 gap-4 md:grid-cols-4">
        <Tile label="Tokens · 14d" value={rollups.isLoading ? '…' : fmtNum(totals.tin + totals.tout + totals.cr)} />
        <Tile label="Requests" value={rollups.isLoading ? '…' : fmtNum(totals.req)} />
        <Tile label="Cache eff." value={rollups.isLoading ? '…' : `${cacheEff}%`} />
        <Tile label="Members" value={members ? members.filter((m) => m.status !== 'revoked').length : '…'} />
      </div>

      <ChartCard className="mb-4" title="Token usage" subtitle="Last 14 days">
        {rollups.isLoading ? <Skeleton h={170} />
          : rollups.error ? <ErrorState error={(rollups.error as Error).message} retry={rollups.refetch} />
            : chart.length === 0 ? <EmptyState title="No usage yet" hint="Usage appears once members serve requests through the pool." />
              : (
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={chart} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke={GRID_STROKE} strokeOpacity={0.6} />
                    <XAxis dataKey="d" tickLine={false} axisLine={false} tick={AXIS_TICK} />
                    <YAxis tickFormatter={(v: number) => fmtNum(v)} tickLine={false} axisLine={false} tick={AXIS_TICK} width={48} />
                    <Tooltip content={<ReportTooltip valueFormatter={fmtNum} />} />
                    <Area type="monotone" dataKey="cacheRead" name="Cache read" stroke={TEAL_SCALE[5]} fill={TEAL_SCALE[5]} fillOpacity={0.15} strokeWidth={2} isAnimationActive={false} />
                    <Area type="monotone" dataKey="output" name="Output" stroke={TEAL_SCALE[2]} fill="transparent" strokeWidth={2} isAnimationActive={false} />
                  </AreaChart>
                </ResponsiveContainer>
              )}
      </ChartCard>

      <Card>
        <div className="flex items-center px-5 pt-4">
          <h3 className="text-[.95rem] font-medium text-foreground">Members</h3>
          <Button variant="ghost" size="sm" className="ml-auto" onClick={() => setInvite(true)}><Plus className="h-4 w-4" /> Add</Button>
        </div>
        {membersQ.error ? <div className="p-5"><ErrorState error={(membersQ.error as Error).message} /></div>
          : !members ? <div className="p-5"><Skeleton h={80} /></div>
            : members.length === 0 ? <div className="p-5"><EmptyState title="No members yet" hint="Generate a join link and send it to a teammate." action={<Button onClick={() => setInvite(true)}>Join link</Button>} /></div>
              : (
                <Table>
                  <THead><TR><TH>Member</TH><TH>Status</TH><TH className="text-right">Consumed · 14d</TH><TH className="text-right">Contributed · 14d</TH><TH /></TR></THead>
                  <TBody>
                    {members.map((m) => <MemberRow key={m.memberId} poolId={poolId} m={m} />)}
                  </TBody>
                </Table>
              )}
      </Card>

      {links.data && links.data.length > 0 && (
        <Card className="mt-4 p-5">
          <div className="mb-2 text-[.95rem] font-medium">Join links</div>
          {links.data.map((l) => (
            <div key={l.joinToken} className="flex items-center gap-3 border-t border-border py-2.5 first:border-t-0">
              <span className="text-[.85rem]">{l.targetEmail}</span>
              <Badge tone={l.used ? 'neutral' : 'success'}>{l.used ? 'used' : 'pending'}</Badge>
              <code className="ml-auto font-mono text-[.76rem] text-muted-foreground">{l.command}</code>
            </div>
          ))}
        </Card>
      )}

      {invite && <InviteModal poolId={poolId} onClose={() => { setInvite(false); links.refetch(); }} />}
    </>
  );
}

function MemberRow({ poolId, m }: { poolId: string; m: Member }) {
  const qc = useQueryClient();
  const revoke = useMutation({ mutationFn: () => revokeMember(poolId, m.memberId), onSuccess: () => qc.invalidateQueries({ queryKey: ['members', poolId] }) });
  return (
    <TR>
      <TD><div className="font-medium">{m.email ?? m.name ?? m.memberId}</div></TD>
      <TD><Badge tone={m.status === 'resting' ? 'warning' : m.status === 'revoked' ? 'neutral' : 'success'}>{m.status}</Badge></TD>
      <TD className="text-right font-mono text-[.8rem] tabular-nums">{sumTally(m.consumed) ? fmtNum(sumTally(m.consumed)) : '—'}</TD>
      <TD className="text-right font-mono text-[.8rem] tabular-nums text-primary">{sumTally(m.contributed) ? fmtNum(sumTally(m.contributed)) : '—'}</TD>
      <TD className="text-right">{m.status !== 'revoked' && <Button variant="danger" size="sm" disabled={revoke.isPending} onClick={() => revoke.mutate()}>{revoke.isPending ? '…' : 'Revoke'}</Button>}</TD>
    </TR>
  );
}

function InviteModal({ poolId, onClose }: { poolId: string; onClose: () => void }) {
  const [email, setEmail] = useState('');
  const m = useMutation({ mutationFn: () => createJoinLink(poolId, email.trim()) });
  return (
    <Modal open onClose={onClose} title="Generate a join link">
      <p className="mb-3 text-[.85rem] text-muted-foreground">The link works once, only for this exact email.</p>
      <input autoFocus value={email} onChange={(e) => setEmail(e.target.value)} placeholder="teammate@devxlabs.ai"
        className="mb-4 h-10 w-full rounded-md border border-border bg-card px-3 text-[.9rem] text-foreground outline-none focus:ring-2 focus:ring-ring" />
      {m.error && <div className="mb-3 text-[.84rem] text-destructive">{(m.error as Error).message}</div>}
      {m.data ? (
        <div className="rounded-md border border-border bg-muted p-3">
          <div className="mb-1 text-[.78rem] text-muted-foreground">Send this to {email}:</div>
          <code className="font-mono text-[.82rem]">{m.data.command}</code>
        </div>
      ) : (
        <Button disabled={!email.trim() || m.isPending} onClick={() => m.mutate()}>{m.isPending ? 'Generating…' : 'Generate link'}</Button>
      )}
    </Modal>
  );
}
