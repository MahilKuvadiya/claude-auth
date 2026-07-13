import crypto from 'node:crypto';
import { prisma } from '../../lib/clients.js';
import { authFirebase } from '../../plugins/auth.js';
import { assertPoolInOrg } from '../../lib/authz.js';

function shapePool(p) {
  return { id: p.id, name: p.name, mode: p.mode || 'failover', status: p.status || 'active', orgId: p.orgId || null };
}

export default async function poolsRoutes(app) {
  // GET /v1/pools — list the actor's org pools
  app.get('/v1/pools', { preHandler: authFirebase }, async (req) => {
    const where = req.actor.role === 'org_admin' && req.actor.orgId ? { orgId: req.actor.orgId } : {};
    const pools = await prisma.pool.findMany({ where });
    return { pools: pools.map(shapePool) };
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
    const pool = await prisma.pool.create({
      data: {
        id, orgId: req.actor.orgId || null, name,
        mode: mode === 'balance' ? 'balance' : 'failover',
        status: 'active', createdBy: req.actor.uid,
      },
    });
    reply.code(201);
    return shapePool(pool);
  });

  // GET /v1/pools/:id
  app.get('/v1/pools/:id', { preHandler: authFirebase }, async (req) => {
    const pool = await prisma.pool.findUnique({ where: { id: req.params.id } });
    if (!pool) throw Object.assign(new Error('pool not found'), { statusCode: 404, code: 'not_found' });
    assertPoolInOrg(req.actor, pool);
    return shapePool(pool);
  });
}
