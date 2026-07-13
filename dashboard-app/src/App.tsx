import { Routes, Route, NavLink, Navigate } from 'react-router-dom';
import { useAuth, isAdmin, isElevated } from './auth';
import { GlassPanel } from './components/glass';
import { SignIn } from './pages/SignIn';
import { Overview } from './pages/Overview';
import { PoolDetail } from './pages/PoolDetail';
import { Analytics } from './pages/Analytics';
import { Sessions } from './pages/Sessions';
import { SessionThread } from './pages/SessionThread';

export default function App() {
  const { user, role, loading } = useAuth();

  if (loading) return <Ambient><div className="grid h-screen place-items-center text-ink-faint">Loading…</div></Ambient>;
  if (!user) return <Ambient><SignIn /></Ambient>;

  const elevated = isElevated(role);
  const admin = isAdmin(role);

  return (
    <Ambient>
      <div className="mx-auto grid max-w-[1180px] grid-cols-[230px_1fr] gap-4 p-4">
        <Sidebar />
        <main className="min-w-0 pb-10">
          <Routes>
            <Route path="/" element={<Analytics />} />
            {elevated && <Route path="/pools" element={<Overview />} />}
            {elevated && <Route path="/pools/:poolId" element={<PoolDetail />} />}
            {admin && <Route path="/sessions" element={<Sessions />} />}
            {admin && <Route path="/sessions/:id" element={<SessionThread />} />}
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
  const { user, role, logout } = useAuth();
  const link = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 rounded-xl px-3 py-[9px] text-[.9rem] no-underline ${isActive ? 'text-white' : 'text-ink-soft'}`;
  const activeStyle = ({ isActive }: { isActive: boolean }) => (isActive ? { background: 'var(--accent)' } : {});
  const roleLabel = role === 'admin' ? 'Admin' : role === 'pod_lead' ? 'Pod lead' : 'Member';
  return (
    <GlassPanel className="sticky top-4 flex h-[calc(100vh-32px)] flex-col gap-1 p-4" spec={false}>
      <div className="flex items-center gap-[10px] px-2 pb-3 pt-1 text-[1.05rem] font-semibold tracking-[-.02em]">
        <span className="h-6 w-6 rounded-lg" style={{ background: 'conic-gradient(from 210deg, var(--accent), var(--accent-deep), var(--accent-lite), var(--accent))' }} />
        claudex
      </div>
      <NavLink to="/" className={link} style={activeStyle} end>Analytics</NavLink>
      {isElevated(role) && <NavLink to="/pools" className={link} style={activeStyle}>Pools</NavLink>}
      {isAdmin(role) && <NavLink to="/sessions" className={link} style={activeStyle}>Sessions</NavLink>}
      <div className="mt-auto flex items-center gap-[10px] border-t border-hairline pt-3">
        <span className="grid h-[30px] w-[30px] place-items-center rounded-full text-[.72rem] font-semibold text-white" style={{ background: 'linear-gradient(135deg, var(--accent-lite), var(--accent-deep))' }}>
          {(user?.email ?? '?')[0].toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[.82rem]">{user?.displayName ?? user?.email}</div>
          <div className="flex items-center gap-2">
            <span className="text-[.68rem] text-ink-faint">{roleLabel}</span>
            <button onClick={logout} className="text-[.72rem] text-ink-faint">· Sign out</button>
          </div>
        </div>
      </div>
    </GlassPanel>
  );
}
