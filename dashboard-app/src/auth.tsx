import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { onIdTokenChanged, signInWithPopup, signOut, User } from 'firebase/auth';
import { auth, googleProvider, ALLOWED_DOMAIN } from './firebase';

interface AuthState {
  user: User | null;
  role: string | null;
  loading: boolean;
  error: string | null;
  signIn: () => Promise<void>;
  logout: () => Promise<void>;
}
const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(
    () =>
      onIdTokenChanged(auth, async (u) => {
        if (u && !u.email?.endsWith(`@${ALLOWED_DOMAIN}`)) {
          await signOut(auth);
          setError(`Only @${ALLOWED_DOMAIN} accounts can sign in.`);
          setUser(null); setRole(null); setLoading(false);
          return;
        }
        setUser(u);
        setRole(u ? ((await u.getIdTokenResult()).claims.role as string) ?? null : null);
        setLoading(false);
      }),
    [],
  );

  const signIn = async () => {
    setError(null);
    try { await signInWithPopup(auth, googleProvider); }
    catch (e) { setError((e as Error).message); }
  };
  const logout = () => signOut(auth);

  return <Ctx.Provider value={{ user, role, loading, error, signIn, logout }}>{children}</Ctx.Provider>;
}

export const useAuth = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error('useAuth outside provider');
  return c;
};

/** Only org admins / pod leads get in. Everyone else sees a clear message. */
export function isAdmin(role: string | null) {
  return role === 'org_admin' || role === 'pod_lead';
}
