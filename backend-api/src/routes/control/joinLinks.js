import crypto from 'node:crypto';
import { Firestore, FieldValue } from '@google-cloud/firestore';
import { db } from '../../lib/clients.js';
import { authFirebase } from '../../plugins/auth.js';
import { assertPoolInOrg } from '../../lib/authz.js';
import { JOIN_TTL_DAYS } from '../../config.js';

async function requirePool(req) {
  const snap = await db.collection('pools').doc(req.params.id).get();
  if (!snap.exists) throw Object.assign(new Error('pool not found'), { statusCode: 404, code: 'not_found' });
  assertPoolInOrg(req.actor, snap.data());
}

export default async function joinLinksRoutes(app) {
  // POST /v1/pools/:id/join-links — generate a targeted, single-use link (anytime).
  app.post('/v1/pools/:id/join-links', {
    preHandler: authFirebase,
    schema: {
      body: {
        type: 'object', required: ['email'], additionalProperties: false,
        properties: { email: { type: 'string', format: 'email' }, role: { type: 'string', maxLength: 32 } },
      },
    },
  }, async (req, reply) => {
    await requirePool(req);
    const poolId = req.params.id;
    const token = 'jt_' + crypto.randomBytes(9).toString('hex');
    const expiresAt = Firestore.Timestamp.fromMillis(Date.now() + JOIN_TTL_DAYS * 864e5);
    await db.collection('joinLinks').doc(token).set({
      poolId, targetEmail: String(req.body.email).toLowerCase(), role: req.body.role || 'member',
      createdBy: req.actor.uid, createdAt: FieldValue.serverTimestamp(), expiresAt, usedAt: null,
    });
    reply.code(201);
    return {
      joinToken: token, targetEmail: req.body.email,
      command: `claudex pool join ${token}`, expiresAt: expiresAt.toMillis(),
    };
  });

  // GET /v1/pools/:id/join-links — list, with server-computed openCount.
  app.get('/v1/pools/:id/join-links', { preHandler: authFirebase }, async (req) => {
    await requirePool(req);
    const snap = await db.collection('joinLinks').where('poolId', '==', req.params.id).get();
    let openCount = 0;
    const links = snap.docs.map((d) => {
      const l = d.data();
      if (!l.usedAt) openCount += 1;
      return {
        joinToken: d.id, targetEmail: l.targetEmail, role: l.role,
        used: !!l.usedAt, memberId: l.memberId || null,
        expiresAt: l.expiresAt ? l.expiresAt.toMillis() : null,
        command: `claudex pool join ${d.id}`,
      };
    });
    return { links, openCount };
  });
}
