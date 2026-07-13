import crypto from 'node:crypto';
import { prisma } from '../../lib/clients.js';
import { authFirebase } from '../../plugins/auth.js';
import { assertPoolInOrg } from '../../lib/authz.js';
import { JOIN_TTL_DAYS } from '../../config.js';

async function requirePool(req) {
  const pool = await prisma.pool.findUnique({ where: { id: req.params.id } });
  if (!pool) throw Object.assign(new Error('pool not found'), { statusCode: 404, code: 'not_found' });
  assertPoolInOrg(req.actor, pool);
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
    const expiresAt = new Date(Date.now() + JOIN_TTL_DAYS * 864e5);
    await prisma.joinLink.create({
      data: {
        token, poolId, targetEmail: String(req.body.email).toLowerCase(),
        role: req.body.role || 'member', createdBy: req.actor.uid, expiresAt,
      },
    });
    reply.code(201);
    return {
      joinToken: token, targetEmail: req.body.email,
      command: `claudex pool join ${token}`, expiresAt: expiresAt.getTime(),
    };
  });

  // GET /v1/pools/:id/join-links — list, with server-computed openCount.
  app.get('/v1/pools/:id/join-links', { preHandler: authFirebase }, async (req) => {
    await requirePool(req);
    const rows = await prisma.joinLink.findMany({ where: { poolId: req.params.id } });
    let openCount = 0;
    const links = rows.map((l) => {
      if (!l.usedAt) openCount += 1;
      return {
        joinToken: l.token, targetEmail: l.targetEmail, role: l.role,
        used: !!l.usedAt, memberId: l.memberId || null,
        expiresAt: l.expiresAt ? l.expiresAt.getTime() : null,
        command: `claudex pool join ${l.token}`,
      };
    });
    return { links, openCount };
  });
}
