import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import {
  onIdTokenChanged, signInWithEmailAndPassword, sendPasswordResetEmail, signOut, User,
} from 'firebase/auth';
import { auth } from './firebase';
import { fetchMe } from './api';

interface AuthState {
  user: User | null;
  role: string | null;
  loading: boolean;
  error: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  logout: () => Promise<void>;
}
const Ctx = createContext<AuthState | null>(null);

function friendly(code: string) {
  if (code.includes('invalid-credential') || code.includes('wrong-password') || code.includes('user-not-found'))
    return 'Incorrect email or password.';
  if (code.includes('too-many-requests')) return 'Too many attempts — try again shortly.';
  return 'Sign-in failed. Please try again.';
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(
    () =>
      onIdTokenChanged(auth, async (u) => {
        setUser(u);
        // Role is resolved SERVER-SIDE from Postgres (never the Firebase claim).
        if (u) {
          try { setRole((await fetchMe()).role); }
          catch { setRole('member'); }
        } else {
          setRole(null);
        }
        setLoading(false);
      }),
    [],
  );

  const signIn = async (email: string, password: string) => {
    setError(null);
    try { await signInWithEmailAndPassword(auth, email.trim(), password); }
    catch (e) { setError(friendly((e as { code?: string }).code || '')); throw e; }
  };
  const resetPassword = async (email: string) => {
    setError(null);
    await sendPasswordResetEmail(auth, email.trim());
  };
  const logout = () => signOut(auth);

  return <Ctx.Provider value={{ user, role, loading, error, signIn, resetPassword, logout }}>{children}</Ctx.Provider>;
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
