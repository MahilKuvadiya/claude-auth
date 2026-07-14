import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function Card({ children, className = '', glass = false }: { children: ReactNode; className?: string; glass?: boolean }) {
  return (
    <div className={cn('rounded-lg border border-border bg-card', glass && 'glass-card', className)}>
      {children}
    </div>
  );
}

export function CardHeader({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={cn('flex items-center gap-3 px-5 pt-4 pb-2', className)}>{children}</div>;
}

export function CardTitle({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <h3 className={cn('text-[.95rem] font-medium text-foreground', className)}>{children}</h3>;
}

export function CardContent({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={cn('px-5 pb-5 pt-1', className)}>{children}</div>;
}
