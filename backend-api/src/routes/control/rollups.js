import { db } from '../../lib/clients.js';
import { authFirebase } from '../../plugins/auth.js';
import { assertPoolInOrg } from '../../lib/authz.js';

export default async function rollupsRoutes(app) {
  // GET /v1/pools/:id/rollups?days=14 — daily usage rollups, sorted ascending, last N days.
  app.get('/v1/pools/:id/rollups', {
    preHandler: authFirebase,
    schema: { querystring: { type: 'object', properties: { days: { type: 'integer', minimum: 1, maximum: 365, default: 14 } } } },
  }, async (req) => {
    const pool = await db.collection('pools').doc(req.params.id).get();
    if (!pool.exists) throw Object.assign(new Error('pool not found'), { statusCode: 404, code: 'not_found' });
    assertPoolInOrg(req.actor, pool.data());

    const days = req.query.days || 14;
    const snap = await db.collection('pools').doc(req.params.id).collection('rollups').get();
    const rollups = snap.docs
      .map((d) => ({ id: d.id, ...d.data(), updatedAt: undefined }))
      .sort((a, b) => (a.id < b.id ? -1 : 1))
      .slice(-days);
    return { rollups };
  });
}
