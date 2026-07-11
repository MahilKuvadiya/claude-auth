'use strict';
/**
 * claudex pool backend — GCP Cloud Functions (gen2).
 *
 *   poolJoin   POST /            contribute a seat via a targeted, single-use link
 *   poolToken  GET  /?pool=…     hand a short-lived access token to a member's proxy
 *   telemetry  POST /            ingest per-request usage from the proxy
 *
 * Design invariants (see research/pool-production/PHASE1.md):
 *  - Refresh tokens live ONLY in Secret Manager; they never reach a client.
 *  - This backend is the SOLE refresher, serialized per member via a Firestore
 *    transaction, so single-use refresh tokens can't collide across machines.
 *  - Join links are bound to one email and burn on first use.
 */
const functions = require('@google-cloud/functions-framework');
const { Firestore, FieldValue } = require('@google-cloud/firestore');
const { SecretManagerServiceClient } = require('@google-cloud/secret-manager');
const { PubSub } = require('@google-cloud/pubsub');
const jwt = require('jsonwebtoken');
require('./admin'); // registers the claudexAdmin function (create pool / join-links / revoke)

// ---- config (env-overridable; defaults match the provisioned project) ----
const PROJECT   = process.env.GCP_PROJECT || 'yash-test-495112';
const DATABASE  = process.env.FIRESTORE_DB || 'claude-pool';
const LOCATION  = process.env.KMS_LOCATION || 'asia-south1';
const KMS_KEY   = process.env.KMS_KEY || `projects/${PROJECT}/locations/${LOCATION}/keyRings/claude-pool/cryptoKeys/refresh-tokens`;
const TOPIC     = process.env.USAGE_TOPIC || 'claude-pool-usage';
const JWT_SECRET_NAME = process.env.JWT_SECRET || `projects/${PROJECT}/secrets/claudex-member-jwt/versions/latest`;

const OAUTH_TOKEN_URL = 'https://platform.claude.com/v1/oauth/token';
const OAUTH_CLIENT_ID = '9d1c250a-e61b-44d9-88ed-5944d1962f5e';
const ACCESS_SKEW_MS  = 60 * 1000;   // refresh if it expires within a minute

const db = new Firestore({ projectId: PROJECT, databaseId: DATABASE });
const sm = new SecretManagerServiceClient();
const pubsub = new PubSub({ projectId: PROJECT });

// ---------- helpers ----------
function bad(res, code, msg) {
  // guard: only real HTTP codes reach res.status(); gRPC error codes (0-16) → 500
  const c = Number.isInteger(code) && code >= 400 && code <= 599 ? code : 500;
  res.status(c).json({ error: msg });
}

async function getJwtSecret() {
  const [v] = await sm.accessSecretVersion({ name: JWT_SECRET_NAME });
  return v.payload.data.toString('utf8');
}
function secretName(poolId, memberId) {
  return `claudex-${poolId}-member-${memberId}`;
}
async function writeRefreshToken(poolId, memberId, refreshToken) {
  const parent = `projects/${PROJECT}`;
  const secretId = secretName(poolId, memberId);
  try {
    // pilot: Google-managed encryption at rest. Phase-5 hardening switches this to
    // CMEK (userManaged replica + kmsKeyName) once the Secret Manager service agent
    // is granted cloudkms.cryptoKeyEncrypterDecrypter on the keyring.
    await sm.createSecret({ parent, secretId, secret: { replication: { automatic: {} } } });
  } catch (e) { if (e.code !== 6 /* ALREADY_EXISTS */) throw e; }
  await sm.addSecretVersion({ parent: `${parent}/secrets/${secretId}`,
    payload: { data: Buffer.from(refreshToken, 'utf8') } });
}
async function readRefreshToken(poolId, memberId) {
  const [v] = await sm.accessSecretVersion({
    name: `projects/${PROJECT}/secrets/${secretName(poolId, memberId)}/versions/latest` });
  return v.payload.data.toString('utf8');
}

// Anthropic OAuth refresh (single-use → callers must persist the rotated token)
async function refreshAccessToken(refreshToken) {
  const r = await fetch(OAUTH_TOKEN_URL, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ grant_type: 'refresh_token', refresh_token: refreshToken, client_id: OAUTH_CLIENT_ID }),
  });
  if (!r.ok) throw new Error(`oauth refresh failed: ${r.status}`);
  return r.json(); // { access_token, refresh_token, expires_in }
}

// A usable access token for a member (cached, refreshed if expiring). Read-only
// callers (usage headroom) — not the serving hot path, so no per-member lock.
async function memberAccessToken(poolId, memberId) {
  const mRef = db.collection('pools').doc(poolId).collection('members').doc(memberId);
  const snap = await mRef.get();
  if (!snap.exists) return null;
  const m = snap.data();
  if (m.status === 'revoked') return null;
  if (m.accessToken && m.accessExpiresAt && m.accessExpiresAt.toMillis() - Date.now() > ACCESS_SKEW_MS)
    return m.accessToken;
  try {
    const rt = await readRefreshToken(poolId, memberId);
    const fresh = await refreshAccessToken(rt);
    const expiresAt = Date.now() + (fresh.expires_in || 3600) * 1000;
    await mRef.update({ accessToken: fresh.access_token, accessExpiresAt: Firestore.Timestamp.fromMillis(expiresAt) });
    if (fresh.refresh_token) await writeRefreshToken(poolId, memberId, fresh.refresh_token);
    return fresh.access_token;
  } catch (e) { return null; }
}

// Anthropic rate-limit usage for a member's token (same endpoint /status uses).
async function anthropicUsage(token) {
  try {
    const r = await fetch('https://api.anthropic.com/api/oauth/usage', {
      headers: { Authorization: `Bearer ${token}`, 'anthropic-beta': 'oauth-2025-04-20', 'anthropic-version': '2023-06-01' },
    });
    if (!r.ok) return null;
    return await r.json();
  } catch (e) { return null; }
}

// Sum byMember.{consumed,contributed} across all rollups → per-member totals.
async function memberTallies(poolId) {
  const snap = await db.collection('pools').doc(poolId).collection('rollups').get();
  const agg = {};
  const K = ['tokensIn', 'tokensOut', 'cacheRead', 'cacheWrite', 'requests'];
  for (const d of snap.docs) {
    const bm = d.data().byMember || {};
    for (const [mid, mv] of Object.entries(bm)) {
      const a = agg[mid] || (agg[mid] = { consumed: {}, contributed: {} });
      for (const sec of ['consumed', 'contributed']) {
        const t = mv[sec] || {};
        for (const k of K) a[sec][k] = (a[sec][k] || 0) + (t[k] || 0);
      }
    }
  }
  return agg;
}

async function verifyMember(req) {
  const auth = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!auth) throw Object.assign(new Error('missing member token'), { code: 401 });
  const payload = jwt.verify(auth, await getJwtSecret(), { algorithms: ['HS256'] });
  return payload; // { poolId, memberId }
}

// ============================================================
// poolJoin — contribute a seat via a targeted, single-use link
// ============================================================
functions.http('poolJoin', async (req, res) => {
  try {
    if (req.method !== 'POST') return bad(res, 405, 'POST only');
    const { joinToken, email, accountUuid, refreshToken } = req.body || {};
    if (!joinToken || !email || !refreshToken) return bad(res, 400, 'joinToken, email, refreshToken required');

    const linkRef = db.collection('joinLinks').doc(joinToken);

    // 1) validate the link WITHOUT mutating anything yet
    const linkSnap = await linkRef.get();
    if (!linkSnap.exists) return bad(res, 404, 'invalid link');
    const l = linkSnap.data();
    if (l.usedAt) return bad(res, 409, 'link already used');
    if (l.expiresAt && l.expiresAt.toMillis() < Date.now()) return bad(res, 410, 'link expired');
    if (String(l.targetEmail).toLowerCase() !== String(email).toLowerCase())
      return bad(res, 403, 'this link is for a different account');
    const memberId = accountUuid || email.split('@')[0];

    // 2) store the refresh token FIRST — if this fails, the link is untouched and reusable
    await writeRefreshToken(l.poolId, memberId, refreshToken);

    // 3) transactionally burn the link + create the member (re-check unused for single-use safety)
    await db.runTransaction(async (tx) => {
      const fresh = await tx.get(linkRef);
      if (fresh.data().usedAt) throw Object.assign(new Error('link already used'), { code: 409 });
      const mRef = db.collection('pools').doc(l.poolId).collection('members').doc(memberId);
      tx.set(mRef, {
        email, accountUuid: accountUuid || null, role: l.role || 'member',
        status: 'active', secretRef: secretName(l.poolId, memberId),
        joinedAt: FieldValue.serverTimestamp(), accessToken: null, accessExpiresAt: null,
      }, { merge: true });
      tx.update(linkRef, { usedAt: FieldValue.serverTimestamp(), memberId });
    });

    const memberToken = jwt.sign({ poolId: l.poolId, memberId },
      await getJwtSecret(), { algorithm: 'HS256', expiresIn: '365d' });
    res.json({ poolId: l.poolId, memberId, memberToken });
  } catch (e) { bad(res, e.code && e.code < 600 ? e.code : 500, e.message); }
});

// ============================================================
// poolToken — hand a short-lived access token (sole refresher)
// ============================================================
functions.http('poolToken', async (req, res) => {
  try {
    const claims = await verifyMember(req);
    const poolId = claims.poolId;

    // ?members=1 → every member + per-member consumed/contributed token totals
    // (so `pool members` shows counts and `pool use <name>` can switch). No tokens.
    if (req.query.members) {
      const [snap, tallies] = await Promise.all([
        db.collection('pools').doc(poolId).collection('members').get(),
        memberTallies(poolId),
      ]);
      const members = snap.docs
        .filter((d) => d.data().status !== 'revoked')
        .map((d) => {
          const f = d.data();
          const t = tallies[d.id] || { consumed: {}, contributed: {} };
          return {
            memberId: d.id, email: f.email || null,
            name: (f.email || d.id).split('@')[0], status: f.status || 'active',
            subscriptionType: f.subscriptionType || null,
            consumed: t.consumed, contributed: t.contributed,
          };
        });
      return res.json({ members });
    }

    // ?usage=1 → live rate-limit headroom per member (backend holds the tokens,
    // so it queries Anthropic on each member's behalf for `pool usage`).
    if (req.query.usage) {
      const snap = await db.collection('pools').doc(poolId).collection('members').get();
      const active = snap.docs.filter((d) => d.data().status !== 'revoked');
      const members = await Promise.all(active.map(async (d) => {
        const f = d.data();
        let usage = null;
        const tok = await memberAccessToken(poolId, d.id);
        if (tok) usage = await anthropicUsage(tok);
        return {
          memberId: d.id, email: f.email || null,
          name: (f.email || d.id).split('@')[0],
          subscriptionType: f.subscriptionType || null, usage,
        };
      }));
      return res.json({ members });
    }

    const selected = (req.query.serve && String(req.query.serve)) || null;
    const memberId = selected || claims.memberId; // default: serve own seat

    const mRef = db.collection('pools').doc(poolId).collection('members').doc(memberId);
    const token = await db.runTransaction(async (tx) => {  // serialize refresh per member
      const snap = await tx.get(mRef);
      if (!snap.exists) throw Object.assign(new Error('member not found'), { code: 404 });
      const m = snap.data();
      if (m.status === 'revoked') throw Object.assign(new Error('member revoked'), { code: 403 });
      if (m.accessToken && m.accessExpiresAt && m.accessExpiresAt.toMillis() - Date.now() > ACCESS_SKEW_MS)
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

    res.json({ accessToken: token.accessToken, expiresAt: token.expiresAt, servingMemberId: memberId });
  } catch (e) { bad(res, e.code && e.code < 600 ? e.code : 500, e.message); }
});

// ============================================================
// telemetry — ingest per-request usage from the proxy
// ============================================================
functions.http('telemetry', async (req, res) => {
  try {
    const { poolId, memberId } = await verifyMember(req);
    const events = (req.body && req.body.events) || [];
    if (!Array.isArray(events) || !events.length) return res.json({ ok: true, ingested: 0 });

    const topic = pubsub.topic(TOPIC);
    const roll = { tokensIn: 0, tokensOut: 0, cacheRead: 0, cacheWrite: 0, requests: 0 };
    await Promise.all(events.map((ev) => {
      roll.tokensIn += ev.inputTokens || 0; roll.tokensOut += ev.outputTokens || 0;
      roll.cacheRead += ev.cacheReadTokens || 0; roll.cacheWrite += ev.cacheWriteTokens || 0;
      roll.requests += ev.requests || 1;
      return topic.publishMessage({ json: { poolId, servingMemberId: ev.servingMemberId || memberId, ...ev } });
    }));

    const inc = FieldValue.increment;
    // per-member CONSUMED = attributed to the caller (the person whose proxy ran
    // these tokens). Each member runs their own proxy with their own memberToken,
    // so this is the accurate per-person usage count (the USP).
    const consumed = {
      tokensIn: inc(roll.tokensIn), tokensOut: inc(roll.tokensOut),
      cacheRead: inc(roll.cacheRead), cacheWrite: inc(roll.cacheWrite), requests: inc(roll.requests),
    };
    // per-member CONTRIBUTED = grouped by whose token actually served each request.
    const contrib = {};
    for (const ev of events) {
      const sid = ev.servingMemberId || memberId;
      const c = contrib[sid] || (contrib[sid] = { tokensIn: 0, tokensOut: 0, cacheRead: 0, cacheWrite: 0, requests: 0 });
      c.tokensIn += ev.inputTokens || 0; c.tokensOut += ev.outputTokens || 0;
      c.cacheRead += ev.cacheReadTokens || 0; c.cacheWrite += ev.cacheWriteTokens || 0; c.requests += ev.requests || 1;
    }
    const byMember = { [memberId]: { consumed } };
    for (const [sid, c] of Object.entries(contrib)) {
      byMember[sid] = byMember[sid] || {};
      byMember[sid].contributed = {
        tokensIn: inc(c.tokensIn), tokensOut: inc(c.tokensOut),
        cacheRead: inc(c.cacheRead), cacheWrite: inc(c.cacheWrite), requests: inc(c.requests),
      };
    }

    const period = new Date().toISOString().slice(0, 10); // daily rollup
    await db.collection('pools').doc(poolId).collection('rollups').doc(period).set({
      tokensIn: inc(roll.tokensIn),
      tokensOut: inc(roll.tokensOut),
      cacheRead: inc(roll.cacheRead),
      cacheWrite: inc(roll.cacheWrite),
      requests: inc(roll.requests),
      byMember, // proper nested map: { <memberId>: { consumed:{…}, contributed:{…} } }
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    res.json({ ok: true, ingested: events.length });
  } catch (e) { bad(res, e.code && e.code < 600 ? e.code : 500, e.message); }
});
