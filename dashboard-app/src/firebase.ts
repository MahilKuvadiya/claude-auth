import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
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

export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ hd: import.meta.env.VITE_ALLOWED_DOMAIN || 'devxlabs.ai' });

export const ALLOWED_DOMAIN = import.meta.env.VITE_ALLOWED_DOMAIN || 'devxlabs.ai';
export const ADMIN_URL = import.meta.env.VITE_ADMIN_URL as string;
