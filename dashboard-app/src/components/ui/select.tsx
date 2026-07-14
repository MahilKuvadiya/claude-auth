import * as RS from '@radix-ui/react-select';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface Option { value: string; label: string }

export function Select({ value, onValueChange, options, placeholder, className, size = 'md' }:
  { value?: string; onValueChange: (v: string) => void; options: Option[]; placeholder?: string; className?: string; size?: 'sm' | 'md' }) {
  return (
    <RS.Root value={value} onValueChange={onValueChange}>
      <RS.Trigger
        className={cn(
          'inline-flex items-center justify-between gap-2 rounded-md border border-border bg-card text-foreground outline-none focus:ring-2 focus:ring-ring',
          size === 'sm' ? 'h-8 px-2.5 text-[.8rem]' : 'h-9 px-3 text-[.85rem]', className,
        )}
      >
        <RS.Value placeholder={placeholder} />
        <RS.Icon><ChevronDown className="h-4 w-4 text-muted-foreground" /></RS.Icon>
      </RS.Trigger>
      <RS.Portal>
        <RS.Content className="z-50 overflow-hidden rounded-md border border-border bg-popover shadow-md" position="popper" sideOffset={4}>
          <RS.Viewport className="p-1">
            {options.map((o) => (
              <RS.Item key={o.value} value={o.value}
                className="relative flex cursor-pointer select-none items-center rounded-[3px] py-1.5 pl-7 pr-3 text-[.85rem] text-foreground outline-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground">
                <RS.ItemIndicator className="absolute left-2"><Check className="h-3.5 w-3.5" /></RS.ItemIndicator>
                <RS.ItemText>{o.label}</RS.ItemText>
              </RS.Item>
            ))}
          </RS.Viewport>
        </RS.Content>
      </RS.Portal>
    </RS.Root>
  );
}
