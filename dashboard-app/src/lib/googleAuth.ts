// Google Identity Services (GIS) sign-in. The dashboard obtains a Google ID token (a JWT
// signed by Google, aud = our OAuth Web Client) and sends it as the API bearer; the backend
// verifies it. No Firebase. The token lives ~1h; on expiry the user re-signs-in.
import { GOOGLE_CLIENT_ID } from './env';

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window { google?: any }
}

const KEY = 'claudex_gid';
let token: string | null = null;
try { token = localStorage.getItem(KEY); } catch { /* ignore */ }

type Sub = (t: string | null) => void;
const subs = new Set<Sub>();

export function getToken(): string | null { return token; }
export function setToken(t: string | null) {
  token = t;
  try { if (t) localStorage.setItem(KEY, t); else localStorage.removeItem(KEY); } catch { /* ignore */ }
  subs.forEach((s) => s(t));
}
export function subscribe(s: Sub) { subs.add(s); return () => { subs.delete(s); }; }

export function decodeJwt(t: string): Record<string, any> | null {
  try {
    const b = t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(decodeURIComponent(escape(atob(b))));
  } catch { return null; }
}
export function isExpired(t: string): boolean {
  const p = decodeJwt(t);
  return !p || typeof p.exp !== 'number' || p.exp * 1000 < Date.now() + 30_000;
}

/** Resolve once GIS has loaded (external script is async). */
export function whenGoogleReady(cb: () => void) {
  if (window.google?.accounts?.id) return cb();
  const id = setInterval(() => {
    if (window.google?.accounts?.id) { clearInterval(id); cb(); }
  }, 100);
  setTimeout(() => clearInterval(id), 10_000);
}

export function initGoogle() {
  window.google.accounts.id.initialize({
    client_id: GOOGLE_CLIENT_ID,
    callback: (res: { credential: string }) => setToken(res.credential),
    auto_select: true,
    context: 'signin',
  });
}

export function renderGoogleButton(el: HTMLElement) {
  window.google.accounts.id.renderButton(el, { theme: 'outline', size: 'large', text: 'continue_with', width: 300, shape: 'pill' });
}

export function promptGoogle() { try { window.google?.accounts?.id?.prompt(); } catch { /* ignore */ } }

export function googleSignOut() {
  try { window.google?.accounts?.id?.disableAutoSelect(); } catch { /* ignore */ }
  setToken(null);
}
