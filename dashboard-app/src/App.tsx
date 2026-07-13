import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth, isAdmin, isElevated } from './auth';
import { firebaseError } from './firebase';
import { AppShell } from './components/layout/AppShell';
import { SignIn } from './pages/SignIn';
import { Overview } from './pages/Overview';
import { Leaderboard } from './pages/Leaderboard';
import { UserAnalytics } from './pages/UserAnalytics';
import { Sessions } from './pages/Sessions';
import { SessionThread } from './pages/SessionThread';
import { Pools } from './pages/Pools';
import { PoolDetail } from './pages/PoolDetail';
import { Admin } from './pages/Admin';

export default function App() {
  const { user, role, loading } = useAuth();

  if (firebaseError) {
    return (
      <div className="app-wash grid h-screen place-items-center p-6">
        <div className="max-w-md rounded-lg border border-border bg-card p-8 text-center">
          <h1 className="font-display text-xl font-semibold text-foreground">Configuration needed</h1>
          <p className="mt-2 text-[.88rem] text-muted-foreground">{firebaseError}</p>
          <p className="mt-3 text-[.8rem] text-muted-foreground">Fill the <code className="font-mono">VITE_FIREBASE_*</code> values in <code className="font-mono">dashboard-app/.env.local</code>, then restart <code className="font-mono">npm run dev</code>.</p>
        </div>
      </div>
    );
  }
  if (loading) return <div className="grid h-screen place-items-center text-muted-foreground">Loading…</div>;
  if (!user) return <SignIn />;

  const admin = isAdmin(role);
  const elevated = isElevated(role);

  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<Overview />} />
        {elevated && <Route path="/team" element={<Leaderboard />} />}
        {elevated && <Route path="/users/:email" element={<UserAnalytics />} />}
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
