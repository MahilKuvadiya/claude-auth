import { initializeApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { E2E } from './lib/e2e';

const cfg = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

// In E2E mode we never touch Firebase (auth is faked) — and calling getAuth() with an
// empty config throws auth/invalid-api-key at import, so skip real init entirely.
const app = E2E ? null : initializeApp(cfg);
export const auth = (E2E || !app ? ({} as unknown) : getAuth(app)) as Auth;

// Auth is Google/email-password (identity only). Roles are resolved SERVER-SIDE from
// Postgres via GET /v1/me (admin bootstrap = the API's ADMIN_EMAILS). No self-serve
// sign-up. All data flows through the unified REST API (backend-api) — no Firestore.
export const API_URL = (import.meta.env.VITE_API_URL as string || '').replace(/\/$/, '');
