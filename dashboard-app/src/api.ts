import { auth, API_URL } from './firebase';
import { E2E } from './lib/e2e';
import {
  Pool, Member, Rollup, JoinLink,
  Me, Summary, UserRow, ActivityPoint, BreakdownItem, SessionMeta, SessionMessage,
  AdminUser, AdminPod,
} from './types';

/** Authenticated fetch against the unified REST API (Firebase ID token). */
async function api<T>(path: string, init?: RequestInit): Promise<T> {
  let token = 'e2e';
  if (!E2E) {
    const user = auth.currentUser;
    if (!user) throw new Error('not signed in');
    token = await user.getIdToken();
  }
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(init?.headers || {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error?.message || `request failed (${res.status})`);
  return body as T;
}

const qs = (o: Record<string, string | number | undefined>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== '') p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : '';
};

// ---- identity ----
export const fetchMe = async (): Promise<Me> => Me.parse(await api('/v1/me'));

// ---- analytics ----
export const fetchSummary = async (days = 30): Promise<Summary> =>
  Summary.parse(await api(`/v1/analytics/summary${qs({ days })}`));

export async function fetchLeaderboard(days = 30): Promise<UserRow[]> {
  const { users } = await api<{ users: unknown[] }>(`/v1/analytics/users${qs({ days })}`);
  return users.map((u) => UserRow.parse(u));
}

export async function fetchActivity(days = 30): Promise<ActivityPoint[]> {
  const { activity } = await api<{ activity: unknown[] }>(`/v1/analytics/activity${qs({ days })}`);
  return activity.map((a) => ActivityPoint.parse(a));
}

export type BreakdownDim = 'model' | 'project' | 'tool' | 'weekday' | 'hour';
export async function fetchBreakdown(by: BreakdownDim, days = 30): Promise<BreakdownItem[]> {
  const { items } = await api<{ items: unknown[] }>(`/v1/analytics/breakdown${qs({ by, days })}`);
  return items.map((i) => BreakdownItem.parse(i));
}

// admin-only
export async function fetchSessions(
  opts: { user?: string; project?: string; model?: string; sort?: string; from?: string; to?: string; limit?: number; offset?: number } = {},
): Promise<{ total: number; sessions: SessionMeta[] }> {
  const { total, sessions } = await api<{ total: number; sessions: unknown[] }>(`/v1/analytics/sessions${qs(opts)}`);
  return { total, sessions: sessions.map((s) => SessionMeta.parse(s)) };
}

export async function fetchSessionThread(id: string): Promise<{ session: SessionMeta; messages: SessionMessage[] }> {
  const { session, messages } = await api<{ session: unknown; messages: unknown[] }>(`/v1/analytics/sessions/${id}`);
  return { session: SessionMeta.parse(session), messages: messages.map((m) => SessionMessage.parse(m)) };
}

// ---- admin management ----
export async function fetchAdminUsers(): Promise<AdminUser[]> {
  const { users } = await api<{ users: unknown[] }>('/v1/admin/users');
  return users.map((u) => AdminUser.parse(u));
}
export const setUserRole = (email: string, role: string) =>
  api<AdminUser>(`/v1/admin/users/${encodeURIComponent(email)}/role`, { method: 'PUT', body: JSON.stringify({ role }) });
export async function fetchAdminPods(): Promise<AdminPod[]> {
  const { pods } = await api<{ pods: unknown[] }>('/v1/admin/pods');
  return pods.map((p) => AdminPod.parse(p));
}
export const createPod = (name: string, leadEmail: string) =>
  api('/v1/admin/pods', { method: 'POST', body: JSON.stringify({ name, leadEmail }) });
export const addPodMember = (podId: string, email: string) =>
  api(`/v1/admin/pods/${podId}/members`, { method: 'POST', body: JSON.stringify({ email }) });
export const removePodMember = (podId: string, email: string) =>
  api(`/v1/admin/pods/${podId}/members/${encodeURIComponent(email)}`, { method: 'DELETE' });

// ---- pools (control-plane) ----
export async function fetchPools(): Promise<Pool[]> {
  const { pools } = await api<{ pools: unknown[] }>('/v1/pools');
  return pools.map((p) => Pool.parse(p));
}
export const createPool = (name: string, mode: 'failover' | 'balance') =>
  api<Pool>('/v1/pools', { method: 'POST', body: JSON.stringify({ name, mode }) });
export async function fetchMembers(poolId: string): Promise<Member[]> {
  const { members } = await api<{ members: unknown[] }>(`/v1/pools/${poolId}/members`);
  return members.map((m) => Member.parse(m));
}
export const revokeMember = (poolId: string, memberId: string) =>
  api<{ memberId: string; status: string }>(`/v1/pools/${poolId}/members/${memberId}`, { method: 'DELETE' });
export async function fetchRollups(poolId: string, days = 14): Promise<Rollup[]> {
  const { rollups } = await api<{ rollups: unknown[] }>(`/v1/pools/${poolId}/rollups?days=${days}`);
  return rollups.map((r) => Rollup.parse(r));
}
export async function listJoinLinks(poolId: string): Promise<JoinLink[]> {
  const { links } = await api<{ links: unknown[]; openCount: number }>(`/v1/pools/${poolId}/join-links`);
  return links.map((l) => JoinLink.parse(l));
}
export const createJoinLink = (poolId: string, email: string, role = 'member') =>
  api<{ joinToken: string; command: string; expiresAt: number }>(
    `/v1/pools/${poolId}/join-links`, { method: 'POST', body: JSON.stringify({ email, role }) });
