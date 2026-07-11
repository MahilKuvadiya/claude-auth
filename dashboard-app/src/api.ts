import { auth, db, ADMIN_URL } from './firebase';
import {
  collection, getDocs, onSnapshot, query, where,
} from 'firebase/firestore';
import { Pool, Member, Rollup, JoinLink } from './types';

/** Authenticated call to the admin Cloud Function (Firebase ID token). */
async function adminFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const user = auth.currentUser;
  if (!user) throw new Error('not signed in');
  const token = await user.getIdToken();
  const res = await fetch(`${ADMIN_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(init?.headers || {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `request failed (${res.status})`);
  return body as T;
}

// ---- admin writes (go through the authenticated Function) ----
export const createPool = (name: string, mode: 'failover' | 'balance') =>
  adminFetch<{ poolId: string }>('/pools', { method: 'POST', body: JSON.stringify({ name, mode }) });

/** Generate a targeted join link — callable ANYTIME after the pool exists. */
export const createJoinLink = (poolId: string, email: string, role = 'member') =>
  adminFetch<{ joinToken: string; command: string; expiresAt: number }>(
    `/pools/${poolId}/join-links`, { method: 'POST', body: JSON.stringify({ email, role }) });

export const listJoinLinks = (poolId: string) =>
  adminFetch<{ links: JoinLink[] }>(`/pools/${poolId}/join-links`).then((r) => r.links.map((l) => JoinLink.parse(l)));

export const revokeMember = (poolId: string, memberId: string) =>
  adminFetch<{ ok: boolean }>(`/members/${memberId}/revoke`, { method: 'POST', body: JSON.stringify({ poolId }) });

// ---- Firestore reads (client SDK, under security rules) ----
export async function fetchPools(): Promise<Pool[]> {
  const snap = await getDocs(collection(db, 'pools'));
  return snap.docs.map((d) => Pool.parse({ id: d.id, ...d.data() }));
}

/** Realtime subscription to a pool's members. Returns an unsubscribe fn. */
export function watchMembers(poolId: string, cb: (m: Member[]) => void, onErr: (e: Error) => void) {
  return onSnapshot(
    collection(db, 'pools', poolId, 'members'),
    (snap) => cb(snap.docs.map((d) => Member.parse({ id: d.id, ...d.data() }))),
    (e) => onErr(e as Error),
  );
}

export async function fetchRollups(poolId: string, days = 14): Promise<Rollup[]> {
  // rollups are one small doc per day — fetch all and sort client-side so no
  // Firestore composite index is required. Doc id is the ISO date (sortable).
  const snap = await getDocs(collection(db, 'pools', poolId, 'rollups'));
  return snap.docs
    .map((d) => Rollup.parse({ id: d.id, ...d.data() }))
    .sort((a, b) => (a.id < b.id ? -1 : 1))
    .slice(-days);
}

export async function fetchOpenLinkCount(poolId: string): Promise<number> {
  const q = query(collection(db, 'joinLinks'), where('poolId', '==', poolId), where('usedAt', '==', null));
  return (await getDocs(q)).size;
}
