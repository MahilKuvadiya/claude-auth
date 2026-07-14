import {
  useReactTable, getCoreRowModel, getSortedRowModel, getPaginationRowModel,
  flexRender, type ColumnDef, type SortingState,
} from '@tanstack/react-table';
import { useState } from 'react';
import { ChevronDown, ChevronUp, ChevronLeft, ChevronRight } from 'lucide-react';
import { Table, THead, TBody, TR, TH, TD } from './table';
import { Button } from './button';
import { cn } from '@/lib/utils';

interface Props<T> {
  columns: ColumnDef<T, unknown>[];
  data: T[];
  pageSize?: number;
  onRowClick?: (row: T) => void;
  initialSort?: SortingState;
  empty?: string;
}

/** Reusable, paginated, sortable table built on @tanstack/react-table. */
export function DataTable<T>({ columns, data, pageSize = 15, onRowClick, initialSort = [], empty = 'No data.' }: Props<T>) {
  const [sorting, setSorting] = useState<SortingState>(initialSort);
  const table = useReactTable({
    data, columns, state: { sorting }, onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(), getSortedRowModel: getSortedRowModel(), getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize } },
  });
  const pg = table.getState().pagination;
  const total = table.getFilteredRowModel().rows.length;
  const start = total === 0 ? 0 : pg.pageIndex * pg.pageSize + 1;
  const end = Math.min((pg.pageIndex + 1) * pg.pageSize, total);

  return (
    <div>
      <Table>
        <THead>
          {table.getHeaderGroups().map((hg) => (
            <TR key={hg.id}>
              {hg.headers.map((h) => {
                const canSort = h.column.getCanSort();
                const dir = h.column.getIsSorted();
                const align = (h.column.columnDef.meta as { align?: string } | undefined)?.align;
                return (
                  <TH key={h.id} className={align === 'right' ? 'text-right' : ''}>
                    <button
                      disabled={!canSort}
                      onClick={h.column.getToggleSortingHandler()}
                      className={cn('inline-flex items-center gap-1', canSort && 'hover:text-foreground', align === 'right' && 'flex-row-reverse')}
                    >
                      {flexRender(h.column.columnDef.header, h.getContext())}
                      {dir === 'asc' && <ChevronUp className="h-3 w-3" />}
                      {dir === 'desc' && <ChevronDown className="h-3 w-3" />}
                    </button>
                  </TH>
                );
              })}
            </TR>
          ))}
        </THead>
        <TBody>
          {table.getRowModel().rows.map((row) => (
            <TR key={row.id} onClick={onRowClick ? () => onRowClick(row.original) : undefined}>
              {row.getVisibleCells().map((cell) => {
                const align = (cell.column.columnDef.meta as { align?: string } | undefined)?.align;
                return <TD key={cell.id} className={align === 'right' ? 'text-right tabular-nums' : ''}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TD>;
              })}
            </TR>
          ))}
          {total === 0 && <TR><TD colSpan={columns.length} className="py-8 text-center text-muted-foreground">{empty}</TD></TR>}
        </TBody>
      </Table>

      {total > pg.pageSize && (
        <div className="flex items-center gap-3 px-4 py-3 text-[.8rem] text-muted-foreground">
          <span>{start}–{end} of {total}</span>
          <span className="flex-1" />
          <Button variant="outline" size="sm" disabled={!table.getCanPreviousPage()} onClick={() => table.previousPage()}><ChevronLeft className="h-4 w-4" /></Button>
          <span>Page {pg.pageIndex + 1} / {table.getPageCount()}</span>
          <Button variant="outline" size="sm" disabled={!table.getCanNextPage()} onClick={() => table.nextPage()}><ChevronRight className="h-4 w-4" /></Button>
        </div>
      )}
    </div>
  );
}
