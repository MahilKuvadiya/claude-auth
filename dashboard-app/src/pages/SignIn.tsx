import { useAuth } from '../auth';
import { GlassPanel, Button } from '../components/glass';

export function SignIn() {
  const { signIn, error } = useAuth();
  return (
    <div className="grid h-screen place-items-center p-6">
      <GlassPanel className="w-full max-w-[400px] p-8 text-center">
        <div className="mx-auto mb-5 h-9 w-9 rounded-xl" style={{ background: 'conic-gradient(from 210deg, var(--accent), var(--accent-deep), var(--accent-lite), var(--accent))' }} />
        <h1 className="m-0 text-[1.4rem] font-semibold tracking-[-.02em]">claudex console</h1>
        <p className="mb-6 mt-2 text-[.92rem] text-ink-soft">Pooled Claude Code capacity — admin access only.</p>
        <Button onClick={signIn}>Sign in with Google</Button>
        {error && <div className="mt-4 text-[.84rem]" style={{ color: 'var(--warn)' }}>{error}</div>}
      </GlassPanel>
    </div>
  );
}
