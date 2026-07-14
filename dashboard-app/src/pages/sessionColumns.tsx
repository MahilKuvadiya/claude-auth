import type { ColumnDef } from '@tanstack/react-table';
import { Link } from 'react-router-dom';
import type { SessionMeta } from '@/types';
import { fmtNum, fmtUsd, fmtDate, shortProject } from '@/lib/utils';

const totalTokens = (s: SessionMeta) => s.inputTokens + s.outputTokens + s.cacheReadTokens + s.cacheCreateTokens;

export const sessionColumns: ColumnDef<SessionMeta, unknown>[] = [
  {
    header: 'User', accessorKey: 'userEmail',
    cell: ({ row }) => (
      <Link to={`/sessions/${row.original.id}`} className="text-foreground no-underline hover:text-primary">{row.original.userEmail}</Link>
    ),
  },
  { header: 'Project', accessorFn: (s) => shortProject(s.project), cell: ({ getValue }) => <span className="text-muted-foreground">{String(getValue())}</span> },
  { header: 'Model', accessorKey: 'model', cell: ({ row }) => <span className="font-mono text-[.74rem] text-muted-foreground">{row.original.model ?? '—'}</span> },
  { header: 'Started', accessorKey: 'startedAt', cell: ({ row }) => <span className="text-muted-foreground">{fmtDate(row.original.startedAt)}</span> },
  { header: 'Msgs', accessorKey: 'msgCount', meta: { align: 'right' }, cell: ({ row }) => row.original.msgCount },
  { header: 'Tokens', accessorFn: (s) => totalTokens(s), meta: { align: 'right' }, cell: ({ row }) => fmtNum(totalTokens(row.original)) },
  { header: 'Cost', accessorKey: 'costUsd', meta: { align: 'right' }, cell: ({ row }) => fmtUsd(row.original.costUsd) },
];
