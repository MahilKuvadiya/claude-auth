// Dev-only test seam. When VITE_E2E is set (Playwright), the app skips Firebase and
// runs as a fake signed-in user whose role comes from a `?e2e=<role>` param in the URL
// hash. Never set in the prod build, so this is inert/tree-shaken in production.
export const E2E = import.meta.env.VITE_E2E === '1' || import.meta.env.VITE_E2E === 'true';

export type Role = 'admin' | 'pod_lead' | 'member';

export function e2eRole(): Role {
  const hash = typeof window !== 'undefined' ? window.location.hash : '';
  const m = hash.match(/[?&]e2e=(admin|pod_lead|member)/);
  return (m?.[1] as Role) || 'member';
}

export const e2eEmail = () => `${e2eRole()}@devxlabs.ai`;
