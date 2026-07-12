import { authMember, assertPoolScope } from '../../plugins/auth.js';
import { mintServeToken } from '../../lib/members.js';

// GET /v1/pools/:id/token?serve=:mid — mint a short-lived access token (sole refresher).
// Default serves the caller's own seat; ?serve selects another member (pooling).
export default async function tokenRoute(app) {
  app.get('/v1/pools/:id/token', {
    preHandler: authMember,
    schema: { querystring: { type: 'object', properties: { serve: { type: 'string' } } } },
  }, async (req) => {
    assertPoolScope(req, req.params.id);
    const memberId = req.query.serve || req.member.memberId;
    const t = await mintServeToken(req.params.id, memberId);
    return { accessToken: t.accessToken, expiresAt: t.expiresAt, servingMemberId: memberId };
  });
}
