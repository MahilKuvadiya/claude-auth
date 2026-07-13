import { prisma } from '../../lib/clients.js';
import { authFirebase, authMemberOrFirebase, assertPoolScope } from '../../plugins/auth.js';
import { assertPoolInOrg } from '../../lib/authz.js';
import { listMembers, listUsage } from '../../lib/members.js';
import { deleteMemberSecret } from '../../lib/secrets.js';

async function loadPoolForActor(req) {
  const pool = await prisma.pool.findUnique({ where: { id: req.params.id } });
  if (!pool) throw Object.assign(new Error('pool not found'), { statusCode: 404, code: 'not_found' });
  if (req.actor) assertPoolInOrg(req.actor, pool);
  return pool;
}

export default async function membersRoutes(app) {
  // GET /v1/pools/:id/members — roster + tallies. Member JWT (own pool) OR admin.
  app.get('/v1/pools/:id/members', { preHandler: authMemberOrFirebase }, async (req) => {
    assertPoolScope(req, req.params.id);
    if (req.actor) await loadPoolForActor(req);
    return { members: await listMembers(req.params.id) };
  });

  // GET /v1/pools/:id/usage — live Anthropic headroom per member. Member JWT OR admin.
  app.get('/v1/pools/:id/usage', { preHandler: authMemberOrFirebase }, async (req) => {
    assertPoolScope(req, req.params.id);
    if (req.actor) await loadPoolForActor(req);
    return { members: await listUsage(req.params.id) };
  });

  // DELETE /v1/pools/:id/members/:mid — revoke (idempotent): tombstone + destroy secret.
  app.delete('/v1/pools/:id/members/:mid', { preHandler: authFirebase }, async (req) => {
    await loadPoolForActor(req);
    const { id: poolId, mid } = req.params;
    await prisma.member.upsert({
      where: { poolId_memberId: { poolId, memberId: mid } },
      create: { poolId, memberId: mid, status: 'revoked', revokedAt: new Date(), revokedBy: req.actor.uid },
      update: { status: 'revoked', revokedAt: new Date(), revokedBy: req.actor.uid },
    });
    await deleteMemberSecret(poolId, mid);
    return { memberId: mid, status: 'revoked' };
  });
}
