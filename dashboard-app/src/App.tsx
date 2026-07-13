import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth, isAdmin, isElevated } from './auth';
import { AppShell } from './components/layout/AppShell';
import { SignIn } from './pages/SignIn';
import { Overview } from './pages/Overview';
import { Leaderboard } from './pages/Leaderboard';
import { Sessions } from './pages/Sessions';
import { SessionThread } from './pages/SessionThread';
import { Pools } from './pages/Pools';
import { PoolDetail } from './pages/PoolDetail';
import { Admin } from './pages/Admin';

export default function App() {
  const { user, role, loading } = useAuth();

  if (loading) return <div className="grid h-screen place-items-center text-muted-foreground">Loading…</div>;
  if (!user) return <SignIn />;

  const admin = isAdmin(role);
  const elevated = isElevated(role);

  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<Overview />} />
        {elevated && <Route path="/team" element={<Leaderboard />} />}
        {admin && <Route path="/sessions" element={<Sessions />} />}
        {admin && <Route path="/sessions/:id" element={<SessionThread />} />}
        {elevated && <Route path="/pools" element={<Pools />} />}
        {elevated && <Route path="/pools/:poolId" element={<PoolDetail />} />}
        {admin && <Route path="/admin" element={<Admin />} />}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  );
}
