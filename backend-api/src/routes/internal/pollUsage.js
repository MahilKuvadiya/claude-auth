import { db } from '../../lib/clients.js';
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

    const pools = await db.collection('pools').where('status', '==', 'active').get();
    let updated = 0;
    for (const p of pools.docs) {
      const members = await p.ref.collection('members').get();
      for (const m of members.docs) {
        if (m.data().status === 'revoked') continue;
        const token = await memberAccessToken(p.id, m.id);
        if (!token) continue;
        const usage = await anthropicUsage(token);
        if (!usage) continue;
        const fiveHourPct = pctUsed(usage.five_hour || usage.fiveHour);
        const weeklyPct = pctUsed(usage.seven_day || usage.weekly);
        await m.ref.set({ rateLimit: { fiveHourPct, weeklyPct }, rateLimitAt: Date.now() }, { merge: true });
        updated += 1;
      }
    }
    return { ok: true, updated };
  });
}
