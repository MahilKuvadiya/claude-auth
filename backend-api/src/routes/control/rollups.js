import { prisma, serializeBigInts } from '../../lib/clients.js';
import { authFirebase } from '../../plugins/auth.js';
import { assertPoolInOrg } from '../../lib/authz.js';

export default async function rollupsRoutes(app) {
  // GET /v1/pools/:id/rollups?days=14 — daily usage rollups, sorted ascending, last N days.
  app.get('/v1/pools/:id/rollups', {
    preHandler: authFirebase,
    schema: { querystring: { type: 'object', properties: { days: { type: 'integer', minimum: 1, maximum: 365, default: 14 } } } },
  }, async (req) => {
    const pool = await prisma.pool.findUnique({ where: { id: req.params.id } });
    if (!pool) throw Object.assign(new Error('pool not found'), { statusCode: 404, code: 'not_found' });
    assertPoolInOrg(req.actor, pool);

    const days = req.query.days || 14;
    const rows = await prisma.rollup.findMany({ where: { poolId: req.params.id }, orderBy: { period: 'asc' } });
    const rollups = rows.slice(-days).map((r) => serializeBigInts({
      id: r.period,
      tokensIn: r.tokensIn, tokensOut: r.tokensOut, cacheRead: r.cacheRead,
      cacheWrite: r.cacheWrite, requests: r.requests, byMember: r.byMember,
    }));
    return { rollups };
  });
}
