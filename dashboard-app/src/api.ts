import { auth, API_URL } from './firebase';
import { Pool, Member, Rollup, JoinLink } from './types';

/** Authenticated fetch against the unified REST API (Firebase ID token). */
async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const user = auth.currentUser;
  if (!user) throw new Error('not signed in');
  const token = await user.getIdToken();
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(init?.headers || {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error?.message || `request failed (${res.status})`);
  return body as T;
}

// ---- pools ----
export async function fetchPools(): Promise<Pool[]> {
  const { pools } = await api<{ pools: unknown[] }>('/v1/pools');
  return pools.map((p) => Pool.parse(p));
}

export const createPool = (name: string, mode: 'failover' | 'balance') =>
  api<Pool>('/v1/pools', { method: 'POST', body: JSON.stringify({ name, mode }) });

// ---- members ----
export async function fetchMembers(poolId: string): Promise<Member[]> {
  const { members } = await api<{ members: unknown[] }>(`/v1/pools/${poolId}/members`);
  return members.map((m) => Member.parse(m));
}

export const revokeMember = (poolId: string, memberId: string) =>
  api<{ memberId: string; status: string }>(`/v1/pools/${poolId}/members/${memberId}`, { method: 'DELETE' });

// ---- usage / rollups ----
export async function fetchRollups(poolId: string, days = 14): Promise<Rollup[]> {
  const { rollups } = await api<{ rollups: unknown[] }>(`/v1/pools/${poolId}/rollups?days=${days}`);
  return rollups.map((r) => Rollup.parse(r));
}

// ---- join links ----
export async function listJoinLinks(poolId: string): Promise<JoinLink[]> {
  const { links } = await api<{ links: unknown[]; openCount: number }>(`/v1/pools/${poolId}/join-links`);
  return links.map((l) => JoinLink.parse(l));
}

export const createJoinLink = (poolId: string, email: string, role = 'member') =>
  api<{ joinToken: string; command: string; expiresAt: number }>(
    `/v1/pools/${poolId}/join-links`, { method: 'POST', body: JSON.stringify({ email, role }) });
