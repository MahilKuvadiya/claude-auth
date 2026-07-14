import type { ReactNode } from 'react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export function ChartCard({ title, subtitle, right, children, className }:
  { title: string; subtitle?: string; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <Card className={cn('flex flex-col', className)}>
      <div className="flex items-center gap-3 px-5 pb-1 pt-4">
        <div>
          <h3 className="text-[.95rem] font-medium text-foreground">{title}</h3>
          {subtitle && <p className="text-[.72rem] text-muted-foreground">{subtitle}</p>}
        </div>
        {right && <div className="ml-auto">{right}</div>}
      </div>
      <div className="px-3 pb-4 pt-2">{children}</div>
    </Card>
  );
}
