import type { ReactNode, ThHTMLAttributes, TdHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export const Table = ({ children, className = '' }: { children: ReactNode; className?: string }) => (
  <div className="overflow-x-auto"><table className={cn('w-full border-collapse text-[.84rem]', className)}>{children}</table></div>
);
export const THead = ({ children }: { children: ReactNode }) => (
  <thead className="text-left text-[.7rem] uppercase tracking-wide text-muted-foreground">{children}</thead>
);
export const TBody = ({ children }: { children: ReactNode }) => <tbody>{children}</tbody>;
export const TR = ({ children, className = '', onClick }: { children: ReactNode; className?: string; onClick?: () => void }) => (
  <tr onClick={onClick} className={cn('border-t border-border', onClick && 'cursor-pointer hover:bg-muted', className)}>{children}</tr>
);
export const TH = ({ children, className = '', ...p }: { children?: ReactNode } & ThHTMLAttributes<HTMLTableCellElement>) => (
  <th className={cn('p-[10px_14px] font-medium', className)} {...p}>{children}</th>
);
export const TD = ({ children, className = '', ...p }: { children?: ReactNode } & TdHTMLAttributes<HTMLTableCellElement>) => (
  <td className={cn('p-[10px_14px] text-foreground', className)} {...p}>{children}</td>
);
