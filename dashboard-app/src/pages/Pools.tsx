import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { PageHeader } from '@/components/layout/AppShell';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Modal } from '@/components/ui/dialog';
import { Segmented } from '@/components/ui/segmented';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { fetchPools, createPool } from '@/api';

export function Pools() {
  const qc = useQueryClient();
  const { data: pools, isLoading, error, refetch } = useQuery({ queryKey: ['pools'], queryFn: fetchPools });
  const [show, setShow] = useState(false);

  return (
    <>
      <PageHeader title="Pools" subtitle="Shared token pools behind one proxy"
        right={<Button onClick={() => setShow(true)}><Plus className="h-4 w-4" /> New pool</Button>} />

      {error ? <ErrorState error={(error as Error).message} retry={refetch} />
        : isLoading ? <div className="grid grid-cols-2 gap-4"><Card className="p-5"><Skeleton h={64} /></Card><Card className="p-5"><Skeleton h={64} /></Card></div>
          : pools && pools.length === 0 ? <EmptyState title="No pools yet" hint="Create a pool, then invite teammates with a join link." action={<Button onClick={() => setShow(true)}>Create your first pool</Button>} />
            : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {pools!.map((p) => (
                  <Link key={p.id} to={`/pools/${p.id}`} className="no-underline">
                    <Card className="p-5 transition-colors hover:border-primary/40">
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="text-[1rem] font-medium text-foreground">{p.name}</div>
                          <div className="font-mono text-[.7rem] text-muted-foreground">{p.id} · {p.mode}</div>
                        </div>
                        <Badge tone={p.status === 'active' ? 'success' : 'neutral'}>{p.status}</Badge>
                      </div>
                      <div className="mt-4 text-[.82rem] text-primary">Open pool →</div>
                    </Card>
                  </Link>
                ))}
              </div>
            )}

      {show && <CreatePoolModal onClose={() => setShow(false)} onCreated={() => { qc.invalidateQueries({ queryKey: ['pools'] }); setShow(false); }} />}
    </>
  );
}

function CreatePoolModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('');
  const [mode, setMode] = useState<'failover' | 'balance'>('failover');
  const m = useMutation({ mutationFn: () => createPool(name.trim(), mode), onSuccess: onCreated });
  return (
    <Modal open onClose={onClose} title="Create a pool">
      <label className="mb-1 block text-[.82rem] text-muted-foreground">Pool name</label>
      <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Platform pod"
        className="mb-4 h-10 w-full rounded-md border border-border bg-card px-3 text-[.9rem] text-foreground outline-none focus:ring-2 focus:ring-ring" />
      <label className="mb-1 block text-[.82rem] text-muted-foreground">Routing mode</label>
      <Segmented className="mb-4" value={mode} onChange={setMode}
        options={[{ value: 'failover', label: 'failover' }, { value: 'balance', label: 'balance' }]} />
      {m.error && <div className="mb-3 text-[.84rem] text-destructive">{(m.error as Error).message}</div>}
      <div className="flex gap-2">
        <Button disabled={!name.trim() || m.isPending} onClick={() => m.mutate()}>{m.isPending ? 'Creating…' : 'Create pool'}</Button>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
      </div>
    </Modal>
  );
}
