import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Users, MessagesSquare, Boxes, Shield, type LucideIcon } from 'lucide-react';
import { useAuth, isAdmin, isElevated } from '@/auth';
import { cn } from '@/lib/utils';

type Show = 'all' | 'elevated' | 'admin';
const NAV: { to: string; label: string; icon: LucideIcon; show: Show; end?: boolean }[] = [
  { to: '/', label: 'Overview', icon: LayoutDashboard, show: 'all', end: true },
  { to: '/team', label: 'Team', icon: Users, show: 'elevated' },
  { to: '/sessions', label: 'Sessions', icon: MessagesSquare, show: 'admin' },
  { to: '/pools', label: 'Pools', icon: Boxes, show: 'elevated' },
  { to: '/admin', label: 'Admin', icon: Shield, show: 'admin' },
];

export function Sidebar() {
  const { role } = useAuth();
  const visible = NAV.filter((n) =>
    n.show === 'all' || (n.show === 'elevated' && isElevated(role)) || (n.show === 'admin' && isAdmin(role)));

  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar md:flex">
      <div className="flex items-center gap-2.5 px-5 py-4 text-[1.05rem] font-semibold tracking-tight text-sidebar-foreground">
        <span className="grid h-7 w-7 place-items-center rounded-md bg-primary text-primary-foreground font-display text-lg leading-none">c</span>
        claudex
      </div>
      <nav className="flex flex-1 flex-col gap-0.5 px-3 py-2">
        {visible.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end}
            className={({ isActive }) => cn(
              'flex items-center gap-3 rounded-md px-3 py-2 text-[.87rem] no-underline transition-colors',
              isActive ? 'bg-sidebar-accent font-medium text-sidebar-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}>
            <n.icon className="h-[18px] w-[18px]" />
            {n.label}
          </NavLink>
        ))}
      </nav>
      <div className="px-5 py-3 text-[.68rem] text-muted-foreground">claudex analytics · v0.2</div>
    </aside>
  );
}
