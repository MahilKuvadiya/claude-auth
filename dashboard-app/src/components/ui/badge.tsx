import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

const tones = {
  accent: 'bg-accent text-accent-foreground',
  neutral: 'bg-muted text-muted-foreground',
  success: 'bg-[color-mix(in_srgb,var(--success)_14%,transparent)] text-[var(--success)]',
  warning: 'bg-[color-mix(in_srgb,var(--warning)_20%,transparent)] text-[#8a6d1a]',
  danger: 'bg-[color-mix(in_srgb,var(--destructive)_14%,transparent)] text-[var(--destructive)]',
} as const;

export function Badge({ children, tone = 'accent', className = '' }:
  { children: ReactNode; tone?: keyof typeof tones; className?: string }) {
  return (
    <span className={cn('inline-flex items-center rounded-md px-2 py-[2px] text-[.7rem] font-medium', tones[tone], className)}>
      {children}
    </span>
  );
}
