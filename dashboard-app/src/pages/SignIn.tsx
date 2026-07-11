import { useState } from 'react';
import { useAuth } from '../auth';
import { GlassPanel, Button } from '../components/glass';

export function SignIn() {
  const { signIn, resetPassword, error } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try { await signIn(email, password); } catch { /* error surfaced via context */ } finally { setBusy(false); }
  };
  const reset = async () => {
    if (!email.trim()) { setNote('Enter your email first, then tap reset.'); return; }
    try { await resetPassword(email); setNote('Password reset link sent — check your inbox.'); }
    catch { setNote('Could not send a reset link for that email.'); }
  };

  const field = 'w-full rounded-xl border border-hairline bg-surface px-3 py-[11px] text-[.92rem] text-ink outline-none';

  return (
    <div className="grid h-screen place-items-center p-6">
      <GlassPanel className="w-full max-w-[400px] p-8">
        <div className="text-center">
          <div className="mx-auto mb-5 h-9 w-9 rounded-xl" style={{ background: 'conic-gradient(from 210deg, var(--accent), var(--accent-deep), var(--accent-lite), var(--accent))' }} />
          <h1 className="m-0 text-[1.4rem] font-semibold tracking-[-.02em]">claudex console</h1>
          <p className="mb-6 mt-2 text-[.92rem] text-ink-soft">Admin access · invite only.</p>
        </div>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <input className={field} type="email" placeholder="you@devxlabs.ai" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
          <input className={field} type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
          <Button type="submit" disabled={busy || !email || !password}>{busy ? 'Signing in…' : 'Sign in'}</Button>
        </form>
        <button onClick={reset} className="mt-3 w-full text-center text-[.8rem] text-ink-faint">Forgot password?</button>
        {error && <div className="mt-4 text-center text-[.84rem]" style={{ color: 'var(--warn)' }}>{error}</div>}
        {note && <div className="mt-3 text-center text-[.82rem] text-ink-soft">{note}</div>}
      </GlassPanel>
    </div>
  );
}
