import { cn } from '@/lib/utils';

export function Segmented<T extends string | number>({ value, onChange, options, className = '' }:
  { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; className?: string }) {
  return (
    <div className={cn('inline-flex rounded-md border border-border bg-card p-0.5', className)}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          onClick={() => onChange(o.value)}
          className={cn(
            'rounded-[4px] px-3 py-1 text-[.8rem] transition-colors',
            value === o.value ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
