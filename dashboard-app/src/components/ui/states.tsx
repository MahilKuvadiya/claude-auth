import type { ReactNode } from 'react';
import { AlertTriangle, Inbox } from 'lucide-react';
import { Card } from './card';
import { Button } from './button';

export function ErrorState({ error, retry }: { error: string; retry?: () => void }) {
  return (
    <Card className="p-8 text-center">
      <AlertTriangle className="mx-auto mb-2 h-5 w-5 text-destructive" />
      <div className="text-[.9rem] text-foreground">{error}</div>
      {retry && <div className="mt-4"><Button variant="outline" size="sm" onClick={retry}>Retry</Button></div>}
    </Card>
  );
}

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <Card className="p-10 text-center">
      <Inbox className="mx-auto mb-3 h-6 w-6 text-muted-foreground" />
      <div className="text-[1rem] font-medium text-foreground">{title}</div>
      {hint && <p className="mx-auto mt-1 max-w-md text-[.85rem] text-muted-foreground">{hint}</p>}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </Card>
  );
}
