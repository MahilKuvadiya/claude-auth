'use strict';
/**
 * claudex admin API — dashboard-facing, authenticated by a Firebase ID token
 * with an `org_admin` (or `pod_lead`) custom claim. Deployed as ONE Cloud Function
 * `claudexAdmin`; routes internally.
 *
 *   POST /pools                     create a pool
 *   POST /pools/:id/join-links      generate a targeted join link (ANYTIME)
 *   GET  /pools/:id/join-links      list this pool's join links
 *   POST /members/:id/revoke        revoke a member (destroy secret + mark revoked)
 *
 * Reads of pools/members/rollups are served to the dashboard directly from
 * Firestore via the client SDK under security rules — not here.
 */
const functions = require('@google-cloud/functions-framework');
const { Firestore, FieldValue } = require('@google-cloud/firestore');
const { SecretManagerServiceClient } = require('@google-cloud/secret-manager');
const admin = require('firebase-admin');
const crypto = require('crypto');

const PROJECT = process.env.GCP_PROJECT || 'yash-test-495112';
const DATABASE = process.env.FIRESTORE_DB || 'claude-pool';
const JOIN_TTL_DAYS = 14;

const db = new Firestore({ projectId: PROJECT, databaseId: DATABASE });
const sm = new SecretManagerServiceClient();
if (!admin.apps.length) admin.initializeApp({ projectId: PROJECT });

function send(res, code, body) {
  // CORS for the dashboard SPA
  res.set('Access-Control-Allow-Origin', process.env.DASHBOARD_ORIGIN || '*');
  res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.status(code).json(body);
}

async function requireAdmin(req) {
  const idToken = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!idToken) throw Object.assign(new Error('sign-in required'), { code: 401 });
  const decoded = await admin.auth().verifyIdToken(idToken);
  const role = decoded.role;
  if (role !== 'org_admin' && role !== 'pod_lead')
    throw Object.assign(new Error('admin access required'), { code: 403 });
  return decoded; // { uid, email, role, orgId }
}

function secretName(poolId, memberId) { return `claudex-${poolId}-member-${memberId}`; }

functions.http('claudexAdmin', async (req, res) => {
  if (req.method === 'OPTIONS') return send(res, 204, {});
  try {
    const actor = await requireAdmin(req);
    const path = (req.path || '/').replace(/\/+$/, '') || '/';
    const parts = path.split('/').filter(Boolean); // e.g. ['pools','pl_x','join-links']

    // POST /pools
    if (req.method === 'POST' && parts.length === 1 && parts[0] === 'pools') {
      const { name, mode } = req.body || {};
      if (!name) return send(res, 400, { error: 'name required' });
      const id = 'pl_' + crypto.randomBytes(5).toString('hex');
      await db.collection('pools').doc(id).set({
        orgId: actor.orgId || null, name, mode: mode === 'balance' ? 'balance' : 'failover',
        status: 'active', createdBy: actor.uid, createdAt: FieldValue.serverTimestamp(),
      });
      return send(res, 200, { poolId: id, name, mode: mode || 'failover' });
    }

    // POST /pools/:id/join-links   — generate a targeted link ANYTIME
    if (req.method === 'POST' && parts.length === 3 && parts[0] === 'pools' && parts[2] === 'join-links') {
      const poolId = parts[1];
      const { email, role } = req.body || {};
      if (!email) return send(res, 400, { error: 'email required' });
      const pool = await db.collection('pools').doc(poolId).get();
      if (!pool.exists) return send(res, 404, { error: 'pool not found' });
      const token = 'jt_' + crypto.randomBytes(9).toString('hex');
      const expiresAt = Firestore.Timestamp.fromMillis(Date.now() + JOIN_TTL_DAYS * 864e5);
      await db.collection('joinLinks').doc(token).set({
        poolId, targetEmail: String(email).toLowerCase(), role: role || 'member',
        createdBy: actor.uid, createdAt: FieldValue.serverTimestamp(), expiresAt, usedAt: null,
      });
      return send(res, 200, {
        joinToken: token, targetEmail: email,
        command: `claudex pool join ${token}`,
        expiresAt: expiresAt.toMillis(),
      });
    }

    // GET /pools/:id/join-links
    if (req.method === 'GET' && parts.length === 3 && parts[0] === 'pools' && parts[2] === 'join-links') {
      const poolId = parts[1];
      const snap = await db.collection('joinLinks').where('poolId', '==', poolId).get();
      const links = snap.docs.map((d) => {
        const l = d.data();
        return {
          joinToken: d.id, targetEmail: l.targetEmail, role: l.role,
          used: !!l.usedAt, memberId: l.memberId || null,
          expiresAt: l.expiresAt ? l.expiresAt.toMillis() : null,
          command: `claudex pool join ${d.id}`,
        };
      });
      return send(res, 200, { links });
    }

    // POST /members/:id/revoke   (body: { poolId })
    if (req.method === 'POST' && parts.length === 3 && parts[0] === 'members' && parts[2] === 'revoke') {
      const memberId = parts[1];
      const { poolId } = req.body || {};
      if (!poolId) return send(res, 400, { error: 'poolId required' });
      await db.collection('pools').doc(poolId).collection('members').doc(memberId)
        .set({ status: 'revoked', revokedAt: FieldValue.serverTimestamp(), revokedBy: actor.uid }, { merge: true });
      try {
        await sm.deleteSecret({ name: `projects/${PROJECT}/secrets/${secretName(poolId, memberId)}` });
      } catch (e) { if (e.code !== 5 /* NOT_FOUND */) throw e; }
      return send(res, 200, { ok: true, memberId, status: 'revoked' });
    }

    return send(res, 404, { error: `no route for ${req.method} ${path}` });
  } catch (e) {
    const code = Number.isInteger(e.code) && e.code >= 400 && e.code <= 599 ? e.code : 500;
    send(res, code, { error: e.message });
  }
});
