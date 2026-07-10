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
    const member = await db.runTransaction(async (tx) => {
      const link = await tx.get(linkRef);
      if (!link.exists) throw Object.assign(new Error('invalid link'), { code: 404 });
      const l = link.data();
      if (l.usedAt) throw Object.assign(new Error('link already used'), { code: 409 });
      if (l.expiresAt && l.expiresAt.toMillis() < Date.now()) throw Object.assign(new Error('link expired'), { code: 410 });
      if (String(l.targetEmail).toLowerCase() !== String(email).toLowerCase())
        throw Object.assign(new Error('this link is for a different account'), { code: 403 });

      const memberId = accountUuid || email.split('@')[0];
      const mRef = db.collection('pools').doc(l.poolId).collection('members').doc(memberId);
      tx.set(mRef, {
        email, accountUuid: accountUuid || null, role: l.role || 'member',
        status: 'active', secretRef: secretName(l.poolId, memberId),
        joinedAt: FieldValue.serverTimestamp(),
        accessToken: null, accessExpiresAt: null,
      }, { merge: true });
      tx.update(linkRef, { usedAt: FieldValue.serverTimestamp(), memberId });
      return { poolId: l.poolId, memberId };
    });

    await writeRefreshToken(member.poolId, member.memberId, refreshToken);
    const memberToken = jwt.sign({ poolId: member.poolId, memberId: member.memberId },
      await getJwtSecret(), { algorithm: 'HS256', expiresIn: '365d' });

    res.json({ poolId: member.poolId, memberId: member.memberId, memberToken });
  } catch (e) { bad(res, e.code && e.code < 600 ? e.code : 500, e.message); }
});

// ============================================================
// poolToken — hand a short-lived access token (sole refresher)
// ============================================================
functions.http('poolToken', async (req, res) => {
  try {
    const { poolId } = await verifyMember(req);
    const selected = (req.query.serve && String(req.query.serve)) || null;
    const memberId = selected || (await verifyMember(req)).memberId; // default: serve own seat

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

    const period = new Date().toISOString().slice(0, 10); // daily rollup
    await db.collection('pools').doc(poolId).collection('rollups').doc(period).set({
      tokensIn: FieldValue.increment(roll.tokensIn),
      tokensOut: FieldValue.increment(roll.tokensOut),
      cacheRead: FieldValue.increment(roll.cacheRead),
      cacheWrite: FieldValue.increment(roll.cacheWrite),
      requests: FieldValue.increment(roll.requests),
      [`byMember.${memberId}.tokensIn`]: FieldValue.increment(roll.tokensIn),
      [`byMember.${memberId}.tokensOut`]: FieldValue.increment(roll.tokensOut),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    res.json({ ok: true, ingested: events.length });
  } catch (e) { bad(res, e.code && e.code < 600 ? e.code : 500, e.message); }
});
