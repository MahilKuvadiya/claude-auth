import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const cfg = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const app = initializeApp(cfg);
export const auth = getAuth(app);
// Named Firestore database (claude-pool), not (default).
export const db = getFirestore(app, import.meta.env.VITE_FIRESTORE_DB || 'claude-pool');

// Auth is email/password: org-admin accounts are provisioned by the operator
// (see backend/provision-admin.mjs). No self-serve sign-up.
export const ADMIN_URL = import.meta.env.VITE_ADMIN_URL as string;
