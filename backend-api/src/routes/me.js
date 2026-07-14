import { authUser } from '../plugins/auth.js';
import { prisma } from '../lib/clients.js';
import { listMembers } from '../lib/members.js';

// Pools the actor may see:
//   admin    → all pools
//   pod_lead → their org's pools
//   member   → pools where they're an active member (by email)
async function visiblePools(actor) {
  if (actor.role === 'admin') return prisma.pool.findMany();
  if (actor.role === 'pod_lead') {
    return prisma.pool.findMany({ where: actor.orgId ? { orgId: actor.orgId } : {} });
  }
  const rows = await prisma.member.findMany({
    where: { email: actor.email, status: { not: 'revoked' } },
    select: { poolId: true },
  });
  const ids = [...new Set(rows.map((r) => r.poolId))];
  if (!ids.length) return [];
  return prisma.pool.findMany({ where: { id: { in: ids } } });
}

// GET /v1/me — the caller's server-resolved identity + role. The dashboard uses this
// (not the Firebase claim) to decide which views to show; the server enforces regardless.
export default async function meRoutes(app) {
  app.get('/v1/me', { preHandler: authUser }, async (req) => ({
    email: req.actor.email,
    role: req.actor.role,
    orgId: req.actor.orgId,
  }));

  // GET /v1/me/pools — the caller's pools with member rosters + cached headroom, scoped
  // by role. Powers the Slack App Home for every role in one call. Uses the rateLimit
  // snapshot the 15-min scheduler writes (no live Anthropic calls on a dashboard render).
  app.get('/v1/me/pools', { preHandler: authUser }, async (req) => {
    const pools = await visiblePools(req.actor);
    const out = await Promise.all(
      pools.map(async (p) => ({
        id: p.id,
        name: p.name,
        mode: p.mode || 'failover',
        status: p.status || 'active',
        members: await listMembers(p.id),
      })),
    );
    return { pools: out };
  });
}
