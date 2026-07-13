import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import {
  onIdTokenChanged, GoogleAuthProvider, signInWithPopup, signOut, User,
} from 'firebase/auth';
import { auth, firebaseError } from './firebase';
import { fetchMe } from './api';
import { E2E, e2eEmail, e2eRole } from './lib/e2e';

const ALLOWED_DOMAIN = (import.meta.env.VITE_ALLOWED_DOMAIN as string) || 'devxlabs.ai';

interface AuthState {
  user: User | null;
  role: string | null;
  loading: boolean;
  error: string | null;
  signInWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
}
const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (E2E) {
      setUser({ email: e2eEmail(), displayName: e2eRole() } as unknown as User);
      setRole(e2eRole());
      setLoading(false);
      return;
    }
    if (firebaseError) { setLoading(false); return; } // App shows a config screen
    return onIdTokenChanged(auth, async (u) => {
      setUser(u);
      // Role is resolved SERVER-SIDE from Postgres (never the Firebase claim).
      if (u) {
        try { setRole((await fetchMe()).role); }
        catch { setRole('member'); }
      } else {
        setRole(null);
      }
      setLoading(false);
    });
  }, []);

  const signInWithGoogle = async () => {
    setError(null);
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ hd: ALLOWED_DOMAIN, prompt: 'select_account' });
    try {
      const res = await signInWithPopup(auth, provider);
      const email = res.user.email || '';
      if (ALLOWED_DOMAIN && !email.toLowerCase().endsWith(`@${ALLOWED_DOMAIN}`)) {
        await signOut(auth);
        setError(`Use your @${ALLOWED_DOMAIN} account.`);
      }
    } catch (e) {
      const code = (e as { code?: string }).code || '';
      if (!code.includes('popup-closed') && !code.includes('cancelled')) setError('Sign-in failed. Please try again.');
    }
  };
  const logout = () => signOut(auth);

  return <Ctx.Provider value={{ user, role, loading, error, signInWithGoogle, logout }}>{children}</Ctx.Provider>;
}

export const useAuth = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error('useAuth outside provider');
  return c;
};

/** admin can see everything (incl. session content). */
export const isAdmin = (role: string | null) => role === 'admin';
/** admin + pod_lead can manage pools and see others' metrics. */
export const isElevated = (role: string | null) => role === 'admin' || role === 'pod_lead';
