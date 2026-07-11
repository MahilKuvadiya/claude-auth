import { Routes, Route, NavLink, Navigate } from 'react-router-dom';
import { useAuth, isAdmin } from './auth';
import { GlassPanel, Button } from './components/glass';
import { SignIn } from './pages/SignIn';
import { Overview } from './pages/Overview';
import { PoolDetail } from './pages/PoolDetail';

export default function App() {
  const { user, role, loading } = useAuth();

  if (loading) return <Ambient><div className="grid h-screen place-items-center text-ink-faint">Loading…</div></Ambient>;
  if (!user) return <Ambient><SignIn /></Ambient>;
  if (!isAdmin(role)) return <Ambient><NotAllowed /></Ambient>;

  return (
    <Ambient>
      <div className="mx-auto grid max-w-[1180px] grid-cols-[230px_1fr] gap-4 p-4">
        <Sidebar />
        <main className="min-w-0 pb-10">
          <Routes>
            <Route path="/" element={<Overview />} />
            <Route path="/pools/:poolId" element={<PoolDetail />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </Ambient>
  );
}

function Ambient({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div className="ambient" aria-hidden><span className="a" /><span className="b" /></div>
      {children}
    </>
  );
}

function Sidebar() {
  const { user, logout } = useAuth();
  const link = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 rounded-xl px-3 py-[9px] text-[.9rem] no-underline ${isActive ? 'text-white' : 'text-ink-soft'}`;
  return (
    <GlassPanel className="sticky top-4 flex h-[calc(100vh-32px)] flex-col gap-1 p-4" spec={false}>
      <div className="flex items-center gap-[10px] px-2 pb-3 pt-1 text-[1.05rem] font-semibold tracking-[-.02em]">
        <span className="h-6 w-6 rounded-lg" style={{ background: 'conic-gradient(from 210deg, var(--accent), var(--accent-deep), var(--accent-lite), var(--accent))' }} />
        claudex
      </div>
      <NavLink to="/" className={link} style={({ isActive }) => (isActive ? { background: 'var(--accent)' } : {})} end>
        Overview
      </NavLink>
      <div className="mt-auto flex items-center gap-[10px] border-t border-hairline pt-3">
        <span className="grid h-[30px] w-[30px] place-items-center rounded-full text-[.72rem] font-semibold text-white" style={{ background: 'linear-gradient(135deg, var(--accent-lite), var(--accent-deep))' }}>
          {(user?.email ?? '?')[0].toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[.82rem]">{user?.displayName ?? user?.email}</div>
          <button onClick={logout} className="text-[.72rem] text-ink-faint">Sign out</button>
        </div>
      </div>
    </GlassPanel>
  );
}

function NotAllowed() {
  const { user, logout } = useAuth();
  return (
    <div className="grid h-screen place-items-center p-6">
      <GlassPanel className="max-w-[420px] p-8 text-center">
        <div className="text-[1.1rem] font-semibold">Not an admin</div>
        <p className="mt-2 text-[.9rem] text-ink-soft">
          {user?.email} isn't an org admin. Ask an existing admin to grant you access.
        </p>
        <div className="mt-5 flex justify-center"><Button variant="ghost" onClick={logout}>Sign out</Button></div>
      </GlassPanel>
    </div>
  );
}
