import { LogOut } from 'lucide-react';
import { useAuth } from '@/auth';
import { Badge } from '@/components/ui/badge';

const roleLabel: Record<string, string> = { admin: 'Admin', pod_lead: 'Pod lead', member: 'Member' };

export function Topbar() {
  const { user, role, logout } = useAuth();
  const email = user?.email ?? '';
  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur sm:px-6">
      <span className="flex-1" />
      <Badge tone="accent">{roleLabel[role ?? 'member'] ?? 'Member'}</Badge>
      <div className="flex items-center gap-2.5">
        <span className="grid h-8 w-8 place-items-center rounded-full bg-primary text-[.75rem] font-semibold text-primary-foreground">
          {(email || '?')[0].toUpperCase()}
        </span>
        <div className="hidden text-right sm:block">
          <div className="max-w-[180px] truncate text-[.8rem] text-foreground">{email}</div>
        </div>
        <button onClick={logout} title="Sign out" className="ml-1 rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground">
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    </header>
  );
}
