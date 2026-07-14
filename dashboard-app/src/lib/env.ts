// Build-time env (VITE_*). The API base and the Google OAuth Web Client id.
export const API_URL = (import.meta.env.VITE_API_URL as string || '').replace(/\/$/, '');
export const GOOGLE_CLIENT_ID = (import.meta.env.VITE_GOOGLE_CLIENT_ID as string) || '';
export const ALLOWED_DOMAIN = (import.meta.env.VITE_ALLOWED_DOMAIN as string) || 'devxlabs.ai';
