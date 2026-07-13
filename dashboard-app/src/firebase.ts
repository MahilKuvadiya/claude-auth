import { initializeApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { E2E } from './lib/e2e';

const cfg = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

// Fail soft: a missing/invalid key shouldn't white-screen the app. We surface
// `firebaseError` and let App render a friendly config screen instead.
export let firebaseError: string | null = null;
let _auth: unknown = {};
if (E2E) {
  _auth = {}; // faked auth in E2E; never touches Firebase
} else if (!cfg.apiKey) {
  firebaseError = 'Missing VITE_FIREBASE_API_KEY — add your Firebase web keys to dashboard-app/.env.local.';
} else {
  try {
    _auth = getAuth(initializeApp(cfg));
  } catch (e) {
    firebaseError = (e as Error).message || 'Firebase failed to initialize.';
  }
}
export const auth = _auth as Auth;

// All data flows through the unified REST API (backend-api) — no Firestore.
export const API_URL = (import.meta.env.VITE_API_URL as string || '').replace(/\/$/, '');
