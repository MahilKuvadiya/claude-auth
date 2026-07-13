import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, X } from 'lucide-react';
import type { ColumnDef } from '@tanstack/react-table';
import { PageHeader } from '@/components/layout/AppShell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DataTable } from '@/components/ui/data-table';
import { Select } from '@/components/ui/select';
import type { AdminUser } from '@/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { fetchAdminUsers, setUserRole, fetchAdminPods, createPod, addPodMember, removePodMember } from '@/api';

const ROLE_OPTS = [
  { value: 'admin', label: 'admin' },
  { value: 'pod_lead', label: 'pod_lead' },
  { value: 'member', label: 'member' },
];

export function Admin() {
  return (
    <>
      <PageHeader title="Admin" subtitle="Users, roles & pods" />
      <div className="space-y-4">
        <UsersCard />
        <PodsCard />
      </div>
    </>
  );
}

function UsersCard() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['admin-users'], queryFn: fetchAdminUsers });
  const setRole = useMutation({
    mutationFn: ({ email, role }: { email: string; role: string }) => setUserRole(email, role),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-users'] }),
  });
  const columns: ColumnDef<AdminUser, unknown>[] = [
    { header: 'Email', accessorKey: 'email' },
    { header: 'Name', accessorKey: 'name', cell: ({ row }) => <span className="text-muted-foreground">{row.original.name ?? '—'}</span> },
    { header: 'Role', accessorKey: 'role', cell: ({ row }) => <Badge tone={row.original.role === 'admin' ? 'accent' : row.original.role === 'pod_lead' ? 'success' : 'neutral'}>{row.original.role}</Badge> },
    {
      header: 'Change role', id: 'change', enableSorting: false,
      cell: ({ row }) => <Select size="sm" value={row.original.role} options={ROLE_OPTS} onValueChange={(role) => setRole.mutate({ email: row.original.email, role })} className="w-36" />,
    },
  ];
  return (
    <Card>
      <CardHeader><CardTitle>Users &amp; roles</CardTitle></CardHeader>
      <CardContent className="px-0 pb-2">
        {q.error ? <div className="px-5 pb-4"><ErrorState error={(q.error as Error).message} retry={q.refetch} /></div>
          : q.isLoading ? <div className="px-5 pb-4"><Skeleton h={200} /></div>
            : <DataTable columns={columns} data={q.data ?? []} pageSize={15} empty="No users yet." initialSort={[{ id: 'email', desc: false }]} />}
      </CardContent>
    </Card>
  );
}

function PodsCard() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['admin-pods'], queryFn: fetchAdminPods });
  const invalidate = () => qc.invalidateQueries({ queryKey: ['admin-pods'] });
  const [name, setName] = useState('');
  const [lead, setLead] = useState('');
  const create = useMutation({ mutationFn: () => createPod(name.trim(), lead.trim()), onSuccess: () => { setName(''); setLead(''); invalidate(); } });
  const addMember = useMutation({ mutationFn: ({ podId, email }: { podId: string; email: string }) => addPodMember(podId, email), onSuccess: invalidate });
  const rmMember = useMutation({ mutationFn: ({ podId, email }: { podId: string; email: string }) => removePodMember(podId, email), onSuccess: invalidate });

  return (
    <Card>
      <CardHeader><CardTitle>Pods</CardTitle></CardHeader>
      <CardContent>
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/40 p-3">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Pod name"
            className="h-9 rounded-md border border-border bg-card px-3 text-[.85rem] outline-none focus:ring-2 focus:ring-ring" />
          <input value={lead} onChange={(e) => setLead(e.target.value)} placeholder="lead@devxlabs.ai"
            className="h-9 rounded-md border border-border bg-card px-3 text-[.85rem] outline-none focus:ring-2 focus:ring-ring" />
          <Button size="sm" disabled={!name.trim() || !lead.trim() || create.isPending} onClick={() => create.mutate()}>
            <Plus className="h-4 w-4" /> Create pod
          </Button>
          {create.error && <span className="text-[.8rem] text-destructive">{(create.error as Error).message}</span>}
        </div>

        {q.isLoading ? <Skeleton h={140} /> : (
          <div className="space-y-3">
            {(q.data ?? []).map((pod) => (
              <div key={pod.id} className="rounded-md border border-border p-3">
                <div className="mb-2 flex items-center gap-2">
                  <span className="font-medium text-foreground">{pod.name}</span>
                  <Badge tone="success">lead: {pod.leadEmail}</Badge>
                  <AddMember onAdd={(email) => addMember.mutate({ podId: pod.id, email })} />
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {pod.members.length === 0 && <span className="text-[.8rem] text-muted-foreground">No members.</span>}
                  {pod.members.map((email) => (
                    <span key={email} className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-[.78rem]">
                      {email}
                      <button className="text-muted-foreground hover:text-destructive" onClick={() => rmMember.mutate({ podId: pod.id, email })}><X className="h-3 w-3" /></button>
                    </span>
                  ))}
                </div>
              </div>
            ))}
            {(q.data ?? []).length === 0 && <div className="text-[.85rem] text-muted-foreground">No pods yet.</div>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function AddMember({ onAdd }: { onAdd: (email: string) => void }) {
  const [email, setEmail] = useState('');
  return (
    <span className="ml-auto flex items-center gap-1">
      <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="add member email"
        className="h-8 w-48 rounded-md border border-border bg-card px-2.5 text-[.8rem] outline-none focus:ring-2 focus:ring-ring" />
      <Button size="sm" variant="outline" disabled={!email.trim()} onClick={() => { onAdd(email.trim()); setEmail(''); }}>Add</Button>
    </span>
  );
}
