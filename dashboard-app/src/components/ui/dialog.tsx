import type { ReactNode } from 'react';
import * as RD from '@radix-ui/react-dialog';
import { X } from 'lucide-react';

export function Modal({ open, onClose, title, children }:
  { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  return (
    <RD.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <RD.Portal>
        <RD.Overlay className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm" />
        <RD.Content className="fixed left-1/2 top-1/2 z-50 w-[min(92vw,440px)] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-card p-5 shadow-xl focus:outline-none">
          <div className="mb-4 flex items-center">
            <RD.Title className="text-[1rem] font-medium text-foreground">{title}</RD.Title>
            <RD.Close className="ml-auto text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></RD.Close>
          </div>
          {children}
        </RD.Content>
      </RD.Portal>
    </RD.Root>
  );
}
