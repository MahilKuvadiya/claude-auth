import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';

const cfg = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const app = initializeApp(cfg);
export const auth = getAuth(app);

// Auth is Google/email-password: org-admin accounts are provisioned by the operator
// (see backend/provision-admin.mjs). No self-serve sign-up. All data now flows through
// the unified REST API (backend-api) — no direct Firestore access from the client.
export const API_URL = (import.meta.env.VITE_API_URL as string || '').replace(/\/$/, '');
