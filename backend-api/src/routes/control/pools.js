import crypto from 'node:crypto';
import { FieldValue } from '@google-cloud/firestore';
import { db } from '../../lib/clients.js';
import { authFirebase } from '../../plugins/auth.js';
import { assertPoolInOrg } from '../../lib/authz.js';

function shapePool(id, d) {
  return { id, name: d.name, mode: d.mode || 'failover', status: d.status || 'active', orgId: d.orgId || null };
}

export default async function poolsRoutes(app) {
  // GET /v1/pools — list the actor's org pools
  app.get('/v1/pools', { preHandler: authFirebase }, async (req) => {
    let q = db.collection('pools');
    if (req.actor.role === 'org_admin' && req.actor.orgId) q = q.where('orgId', '==', req.actor.orgId);
    const snap = await q.get();
    return { pools: snap.docs.map((d) => shapePool(d.id, d.data())) };
  });

  // POST /v1/pools — create
  app.post('/v1/pools', {
    preHandler: authFirebase,
    schema: {
      body: {
        type: 'object', required: ['name'], additionalProperties: false,
        properties: { name: { type: 'string', minLength: 1, maxLength: 80 }, mode: { enum: ['failover', 'balance'] } },
      },
    },
  }, async (req, reply) => {
    const { name, mode } = req.body;
    const id = 'pl_' + crypto.randomBytes(5).toString('hex');
    const doc = {
      orgId: req.actor.orgId || null, name, mode: mode === 'balance' ? 'balance' : 'failover',
      status: 'active', createdBy: req.actor.uid, createdAt: FieldValue.serverTimestamp(),
    };
    await db.collection('pools').doc(id).set(doc);
    reply.code(201);
    return shapePool(id, doc);
  });

  // GET /v1/pools/:id
  app.get('/v1/pools/:id', { preHandler: authFirebase }, async (req) => {
    const snap = await db.collection('pools').doc(req.params.id).get();
    if (!snap.exists) throw Object.assign(new Error('pool not found'), { statusCode: 404, code: 'not_found' });
    assertPoolInOrg(req.actor, snap.data());
    return shapePool(snap.id, snap.data());
  });
}
