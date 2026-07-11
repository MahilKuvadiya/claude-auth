import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchPools, createPool } from '../api';
import { GlassPanel, Card, Button, Pill, Skeleton, ErrorState, EmptyState, GlassModal } from '../components/glass';

export function Overview() {
  const qc = useQueryClient();
  const { data: pools, isLoading, error, refetch } = useQuery({ queryKey: ['pools'], queryFn: fetchPools });
  const [showCreate, setShowCreate] = useState(false);

  return (
    <>
      <GlassPanel className="mb-4 flex items-center gap-3 p-[14px_18px]" spec={false}>
        <h1 className="m-0 text-[1.15rem] font-semibold tracking-[-.02em]">Organization overview</h1>
        <span className="flex-1" />
        <Button onClick={() => setShowCreate(true)}>+ New pool</Button>
      </GlassPanel>

      {isLoading && (
        <div className="grid grid-cols-2 gap-4">
          <Card><Skeleton h={64} /></Card><Card><Skeleton h={64} /></Card>
        </div>
      )}
      {error && <ErrorState error={(error as Error).message} retry={refetch} />}

      {pools && pools.length === 0 && (
        <EmptyState
          title="No pools yet"
          hint="Create your first pool, then invite teammates with a targeted join link."
          action={<Button onClick={() => setShowCreate(true)}>+ Create your first pool</Button>}
        />
      )}

      {pools && pools.length > 0 && (
        <div className="grid grid-cols-2 gap-4">
          {pools.map((p) => (
            <Link key={p.id} to={`/pools/${p.id}`} className="no-underline">
              <GlassPanel className="p-[18px]">
                <div className="mb-3 flex items-start justify-between">
                  <div>
                    <div className="text-[1.02rem] font-semibold text-ink">{p.name}</div>
                    <div className="font-mono text-[.7rem] text-ink-faint">{p.id} · {p.mode}</div>
                  </div>
                  <Pill>{p.status}</Pill>
                </div>
                <div className="text-[.85rem] text-ink-soft">Open pool →</div>
              </GlassPanel>
            </Link>
          ))}
        </div>
      )}

      {showCreate && (
        <CreatePoolModal
          onClose={() => setShowCreate(false)}
          onCreated={() => { qc.invalidateQueries({ queryKey: ['pools'] }); setShowCreate(false); }}
        />
      )}
    </>
  );
}

function CreatePoolModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('');
  const [mode, setMode] = useState<'failover' | 'balance'>('failover');
  const m = useMutation({ mutationFn: () => createPool(name.trim(), mode), onSuccess: onCreated });

  return (
    <GlassModal title="Create a pool" onClose={onClose}>
      <label className="mb-1 block text-[.82rem] text-ink-soft">Pool name</label>
      <input
        autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Platform POD"
        className="mb-4 w-full rounded-xl border border-hairline bg-surface px-3 py-[11px] text-[.92rem] text-ink outline-none"
      />
      <label className="mb-1 block text-[.82rem] text-ink-soft">Routing mode</label>
      <div className="mb-4 flex gap-2">
        {(['failover', 'balance'] as const).map((mm) => (
          <button key={mm} onClick={() => setMode(mm)}
            className="flex-1 rounded-xl border px-3 py-[11px] text-[.86rem]"
            style={mode === mm ? { background: 'var(--accent-wash)', color: 'var(--accent)', borderColor: 'var(--accent)' } : { background: 'var(--surface)', color: 'var(--ink-soft)', borderColor: 'var(--hairline)' }}>
            {mm}
          </button>
        ))}
      </div>
      {m.error && <div className="mb-3 text-[.84rem]" style={{ color: 'var(--warn)' }}>{(m.error as Error).message}</div>}
      <div className="flex gap-2">
        <Button type="submit" disabled={!name.trim() || m.isPending} onClick={() => m.mutate()}>
          {m.isPending ? 'Creating…' : 'Create pool'}
        </Button>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
      </div>
    </GlassModal>
  );
}
