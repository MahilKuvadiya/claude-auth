import { useState } from 'react';
import { useAuth } from '@/auth';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export function SignIn() {
  const { signIn, resetPassword, error } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try { await signIn(email, password); } catch { /* surfaced via context */ } finally { setBusy(false); }
  };
  const reset = async () => {
    if (!email.trim()) { setNote('Enter your email first, then tap reset.'); return; }
    try { await resetPassword(email); setNote('Password reset link sent — check your inbox.'); }
    catch { setNote('Could not send a reset link for that email.'); }
  };
  const field = 'h-11 w-full rounded-md border border-border bg-card px-3 text-[.92rem] text-foreground outline-none focus:ring-2 focus:ring-ring';

  return (
    <div className="app-wash grid h-screen place-items-center p-6">
      <Card className="w-full max-w-[400px] p-8">
        <div className="text-center">
          <div className="mx-auto mb-4 grid h-10 w-10 place-items-center rounded-lg bg-primary font-display text-2xl leading-none text-primary-foreground">c</div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">claudex console</h1>
          <p className="mb-6 mt-1 text-[.9rem] text-muted-foreground">Sign in to view your analytics.</p>
        </div>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <input className={field} type="email" placeholder="you@devxlabs.ai" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
          <input className={field} type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
          <Button type="submit" disabled={busy || !email || !password}>{busy ? 'Signing in…' : 'Sign in'}</Button>
        </form>
        <button onClick={reset} className="mt-3 w-full text-center text-[.8rem] text-muted-foreground hover:text-foreground">Forgot password?</button>
        {error && <div className="mt-4 text-center text-[.84rem] text-destructive">{error}</div>}
        {note && <div className="mt-3 text-center text-[.82rem] text-muted-foreground">{note}</div>}
      </Card>
    </div>
  );
}
