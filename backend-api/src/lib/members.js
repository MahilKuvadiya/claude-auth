// Member token minting + usage aggregation. This service is the SOLE refresher of
// single-use rotating refresh tokens; the serving path serializes per member via a
// Firestore transaction so parallel proxies can't burn a refresh token twice.
import { Firestore, FieldValue } from '@google-cloud/firestore';
import { db } from './clients.js';
import { readRefreshToken, writeRefreshToken } from './secrets.js';
import { refreshAccessToken, anthropicUsage } from './anthropic.js';
import { config } from '../config.js';

const TALLY_KEYS = ['tokensIn', 'tokensOut', 'cacheRead', 'cacheWrite', 'requests'];

function memberRef(poolId, memberId) {
  return db.collection('pools').doc(poolId).collection('members').doc(memberId);
}

/** Fresh access token for a member, SERIALIZED via transaction (the serving hot path). */
export async function mintServeToken(poolId, memberId) {
  const mRef = memberRef(poolId, memberId);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(mRef);
    if (!snap.exists) throw Object.assign(new Error('member not found'), { statusCode: 404, code: 'member_not_found' });
    const m = snap.data();
    if (m.status === 'revoked') throw Object.assign(new Error('member revoked'), { statusCode: 403, code: 'member_revoked' });
    if (m.accessToken && m.accessExpiresAt && m.accessExpiresAt.toMillis() - Date.now() > config.accessSkewMs)
      return { accessToken: m.accessToken, expiresAt: m.accessExpiresAt.toMillis() };

    const rt = await readRefreshToken(poolId, memberId);
    const fresh = await refreshAccessToken(rt);
    const expiresAt = Date.now() + (fresh.expires_in || 3600) * 1000;
    tx.update(mRef, {
      accessToken: fresh.access_token,
      accessExpiresAt: Firestore.Timestamp.fromMillis(expiresAt),
      rateLimit: m.rateLimit || null,
    });
    if (fresh.refresh_token) await writeRefreshToken(poolId, memberId, fresh.refresh_token);
    return { accessToken: fresh.access_token, expiresAt };
  });
}

/** Read-only usable token (usage/headroom path) — no per-member lock. Returns null on failure. */
export async function memberAccessToken(poolId, memberId) {
  const snap = await memberRef(poolId, memberId).get();
  if (!snap.exists) return null;
  const m = snap.data();
  if (m.status === 'revoked') return null;
  if (m.accessToken && m.accessExpiresAt && m.accessExpiresAt.toMillis() - Date.now() > config.accessSkewMs)
    return m.accessToken;
  try {
    const rt = await readRefreshToken(poolId, memberId);
    const fresh = await refreshAccessToken(rt);
    const expiresAt = Date.now() + (fresh.expires_in || 3600) * 1000;
    await memberRef(poolId, memberId).update({
      accessToken: fresh.access_token,
      accessExpiresAt: Firestore.Timestamp.fromMillis(expiresAt),
    });
    if (fresh.refresh_token) await writeRefreshToken(poolId, memberId, fresh.refresh_token);
    return fresh.access_token;
  } catch { return null; }
}

/** Sum byMember.{consumed,contributed} across all rollups → per-member totals. */
export async function memberTallies(poolId) {
  const snap = await db.collection('pools').doc(poolId).collection('rollups').get();
  const agg = {};
  for (const d of snap.docs) {
    const bm = d.data().byMember || {};
    for (const [mid, mv] of Object.entries(bm)) {
      const a = agg[mid] || (agg[mid] = { consumed: {}, contributed: {} });
      for (const sec of ['consumed', 'contributed']) {
        const t = mv[sec] || {};
        for (const k of TALLY_KEYS) a[sec][k] = (a[sec][k] || 0) + (t[k] || 0);
      }
    }
  }
  return agg;
}

/** Roster with tallies — no tokens. Used by both CLI and dashboard. */
export async function listMembers(poolId) {
  const [snap, tallies] = await Promise.all([
    db.collection('pools').doc(poolId).collection('members').get(),
    memberTallies(poolId),
  ]);
  return snap.docs
    .filter((d) => d.data().status !== 'revoked')
    .map((d) => {
      const f = d.data();
      const t = tallies[d.id] || { consumed: {}, contributed: {} };
      return {
        memberId: d.id,
        email: f.email || null,
        name: (f.email || d.id).split('@')[0],
        status: f.status || 'active',
        subscriptionType: f.subscriptionType || null,
        rateLimit: f.rateLimit || null,
        consumed: t.consumed,
        contributed: t.contributed,
      };
    });
}

/** Live Anthropic headroom per member (backend holds the tokens). */
export async function listUsage(poolId) {
  const snap = await db.collection('pools').doc(poolId).collection('members').get();
  const active = snap.docs.filter((d) => d.data().status !== 'revoked');
  return Promise.all(active.map(async (d) => {
    const f = d.data();
    const tok = await memberAccessToken(poolId, d.id);
    const usage = tok ? await anthropicUsage(tok) : null;
    return {
      memberId: d.id,
      email: f.email || null,
      name: (f.email || d.id).split('@')[0],
      subscriptionType: f.subscriptionType || null,
      usage,
    };
  }));
}

export { FieldValue, memberRef };
