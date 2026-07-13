import { prisma } from '../../lib/clients.js';
import { memberAccessToken } from '../../lib/members.js';
import { anthropicUsage } from '../../lib/anthropic.js';
import { config } from '../../config.js';

// Pull a 0-100 "percent used" out of an Anthropic usage window object, tolerant of shape.
function pctUsed(win) {
  if (!win || typeof win !== 'object') return null;
  if (typeof win.utilization === 'number') return Math.round(win.utilization * 100);
  const used = win.used ?? win.consumed;
  const limit = win.limit ?? win.total ?? win.max;
  if (typeof used === 'number' && typeof limit === 'number' && limit > 0)
    return Math.round((used / limit) * 100);
  if (typeof win.remaining === 'number' && typeof limit === 'number' && limit > 0)
    return Math.round((1 - win.remaining / limit) * 100);
  return null;
}

// POST /v1/internal/poll-usage — Cloud Scheduler → writes member.rateLimit {fiveHourPct,weeklyPct}.
// Gated by a shared internal token header (prod: front with OIDC audience check, not public).
export default async function pollUsageRoute(app) {
  app.post('/v1/internal/poll-usage', async (req) => {
    const tok = (req.headers['x-internal-token'] || '').toString();
    if (!config.internalToken || tok !== config.internalToken)
      throw Object.assign(new Error('internal only'), { statusCode: 403, code: 'forbidden' });

    const pools = await prisma.pool.findMany({ where: { status: 'active' }, select: { id: true } });
    let updated = 0;
    for (const p of pools) {
      const members = await prisma.member.findMany({
        where: { poolId: p.id, status: { not: 'revoked' } }, select: { memberId: true },
      });
      for (const m of members) {
        const token = await memberAccessToken(p.id, m.memberId);
        if (!token) continue;
        const usage = await anthropicUsage(token);
        if (!usage) continue;
        const fiveHourPct = pctUsed(usage.five_hour || usage.fiveHour);
        const weeklyPct = pctUsed(usage.seven_day || usage.weekly);
        await prisma.member.update({
          where: { poolId_memberId: { poolId: p.id, memberId: m.memberId } },
          data: { rateLimit: { fiveHourPct, weeklyPct, at: Date.now() } },
        });
        updated += 1;
      }
    }
    return { ok: true, updated };
  });
}
