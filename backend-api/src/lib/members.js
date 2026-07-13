// Member token minting + usage aggregation. This service is the SOLE refresher of
// single-use rotating refresh tokens; the serving path serializes per member via a
// `SELECT … FOR UPDATE` row lock (Postgres) so parallel proxies can't burn a refresh
// token twice — the exact guarantee the old Firestore transaction gave.
import { prisma } from './clients.js';
import { readRefreshToken, writeRefreshToken } from './secrets.js';
import { refreshAccessToken, anthropicUsage } from './anthropic.js';
import { config } from '../config.js';

const TALLY_KEYS = ['tokensIn', 'tokensOut', 'cacheRead', 'cacheWrite', 'requests'];

/** Fresh access token for a member, SERIALIZED via a row lock (the serving hot path). */
export async function mintServeToken(poolId, memberId) {
  return prisma.$transaction(async (tx) => {
    // Lock the member row for the duration of the txn (blocks concurrent serves).
    const rows = await tx.$queryRaw`
      SELECT "status", "accessToken", "accessExpiresAt", "rateLimit"
      FROM "Member" WHERE "poolId" = ${poolId} AND "memberId" = ${memberId} FOR UPDATE`;
    if (!rows.length) throw Object.assign(new Error('member not found'), { statusCode: 404, code: 'member_not_found' });
    const m = rows[0];
    if (m.status === 'revoked') throw Object.assign(new Error('member revoked'), { statusCode: 403, code: 'member_revoked' });
    if (m.accessToken && m.accessExpiresAt && m.accessExpiresAt.getTime() - Date.now() > config.accessSkewMs)
      return { accessToken: m.accessToken, expiresAt: m.accessExpiresAt.getTime() };

    const rt = await readRefreshToken(poolId, memberId);
    const fresh = await refreshAccessToken(rt);
    const expiresAt = Date.now() + (fresh.expires_in || 3600) * 1000;
    await tx.member.update({
      where: { poolId_memberId: { poolId, memberId } },
      data: { accessToken: fresh.access_token, accessExpiresAt: new Date(expiresAt) },
    });
    if (fresh.refresh_token) await writeRefreshToken(poolId, memberId, fresh.refresh_token);
    return { accessToken: fresh.access_token, expiresAt };
  });
}

/** Read-only usable token (usage/headroom path) — no per-member lock. Returns null on failure. */
export async function memberAccessToken(poolId, memberId) {
  const m = await prisma.member.findUnique({ where: { poolId_memberId: { poolId, memberId } } });
  if (!m) return null;
  if (m.status === 'revoked') return null;
  if (m.accessToken && m.accessExpiresAt && m.accessExpiresAt.getTime() - Date.now() > config.accessSkewMs)
    return m.accessToken;
  try {
    const rt = await readRefreshToken(poolId, memberId);
    const fresh = await refreshAccessToken(rt);
    const expiresAt = Date.now() + (fresh.expires_in || 3600) * 1000;
    await prisma.member.update({
      where: { poolId_memberId: { poolId, memberId } },
      data: { accessToken: fresh.access_token, accessExpiresAt: new Date(expiresAt) },
    });
    if (fresh.refresh_token) await writeRefreshToken(poolId, memberId, fresh.refresh_token);
    return fresh.access_token;
  } catch { return null; }
}

/** Sum byMember.{consumed,contributed} across all rollups → per-member totals. */
export async function memberTallies(poolId) {
  const rollups = await prisma.rollup.findMany({ where: { poolId }, select: { byMember: true } });
  const agg = {};
  for (const r of rollups) {
    const bm = r.byMember || {};
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
  const [members, tallies] = await Promise.all([
    prisma.member.findMany({ where: { poolId, status: { not: 'revoked' } } }),
    memberTallies(poolId),
  ]);
  return members.map((f) => {
    const t = tallies[f.memberId] || { consumed: {}, contributed: {} };
    return {
      memberId: f.memberId,
      email: f.email || null,
      name: (f.email || f.memberId).split('@')[0],
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
  const active = await prisma.member.findMany({ where: { poolId, status: { not: 'revoked' } } });
  return Promise.all(active.map(async (f) => {
    const tok = await memberAccessToken(poolId, f.memberId);
    const usage = tok ? await anthropicUsage(tok) : null;
    return {
      memberId: f.memberId,
      email: f.email || null,
      name: (f.email || f.memberId).split('@')[0],
      subscriptionType: f.subscriptionType || null,
      usage,
    };
  }));
}
