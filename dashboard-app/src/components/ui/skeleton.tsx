import { cn } from '@/lib/utils';

export function Skeleton({ h = 20, w = '100%', className = '' }: { h?: number; w?: number | string; className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-muted', className)} style={{ height: h, width: w }} />;
}
