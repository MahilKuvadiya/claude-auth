import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { fetchMe } from './api';
import { GOOGLE_CLIENT_ID, ALLOWED_DOMAIN } from './lib/env';
import {
  getToken, setToken, subscribe, decodeJwt, isExpired, initGoogle, whenGoogleReady, googleSignOut,
} from './lib/googleAuth';
import { E2E, e2eEmail, e2eRole } from './lib/e2e';

interface DashUser { email: string; name?: string; picture?: string }

interface AuthState {
  user: DashUser | null;
  role: string | null;
  loading: boolean;
  error: string | null;
  logout: () => void;
}
const Ctx = createContext<AuthState | null>(null);

/** Sign-in is missing config if there's no OAuth client id (outside E2E). */
export const NEEDS_CONFIG = !E2E && !GOOGLE_CLIENT_ID;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<DashUser | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (E2E) {
      setUser({ email: e2eEmail(), name: e2eRole() });
      setRole(e2eRole());
      setLoading(false);
      return;
    }
    if (NEEDS_CONFIG) { setLoading(false); return; }

    // Load the identity for the current token (or clear if bad/wrong-domain/expired).
    const load = async (t: string | null) => {
      if (t && !isExpired(t)) {
        const p = decodeJwt(t);
        const email = String(p?.email || '').toLowerCase();
        if (ALLOWED_DOMAIN && !email.endsWith(`@${ALLOWED_DOMAIN}`)) {
          setError(`Use your @${ALLOWED_DOMAIN} account.`);
          googleSignOut(); setUser(null); setRole(null); setLoading(false);
          return;
        }
        setUser({ email, name: p?.name, picture: p?.picture });
        try { setRole((await fetchMe()).role); } catch { setRole('member'); }
      } else {
        if (t) setToken(null); // expired
        setUser(null); setRole(null);
      }
      setLoading(false);
    };

    const unsub = subscribe((t) => { setError(null); load(t); });
    whenGoogleReady(() => { initGoogle(); });
    load(getToken());
    return unsub;
  }, []);

  const logout = () => { googleSignOut(); setUser(null); setRole(null); };

  return <Ctx.Provider value={{ user, role, loading, error, logout }}>{children}</Ctx.Provider>;
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
