import { Prisma } from '@prisma/client';
import { prisma, serializeBigInts } from '../../lib/clients.js';
import { authUser } from '../../plugins/auth.js';
import { allowedEmails } from '../../lib/rbac.js';

// Resolve an inclusive-from / exclusive-to window; defaults to the last `days` (30).
function window(q) {
  const to = q.to ? new Date(q.to) : new Date();
  const from = q.from ? new Date(q.from) : new Date(to.getTime() - (q.days || 30) * 864e5);
  return { from, to };
}

const dateQ = {
  type: 'object',
  properties: {
    from: { type: 'string' }, to: { type: 'string' },
    days: { type: 'integer', minimum: 1, maximum: 365 },
  },
};

export default async function analyticsQueryRoutes(app) {
  // GET /v1/analytics/summary — totals across the caller's allowed user set.
  app.get('/v1/analytics/summary', { preHandler: authUser, schema: { querystring: dateQ } }, async (req) => {
    const allowed = await allowedEmails(req.actor);
    const { from, to } = window(req.query);
    const where = {
      startedAt: { gte: from, lt: to },
      ...(allowed === null ? {} : { userEmail: { in: allowed } }),
    };
    const [agg, sessions] = await Promise.all([
      prisma.session.aggregate({
        where,
        _sum: { inputTokens: true, outputTokens: true, cacheReadTokens: true, cacheCreateTokens: true, costUsd: true, msgCount: true },
        _count: { _all: true },
      }),
      prisma.session.count({ where }),
    ]);
    return serializeBigInts({
      scope: req.actor.role,
      from, to,
      totals: {
        sessions,
        messages: agg._sum.msgCount || 0,
        inputTokens: agg._sum.inputTokens || 0n,
        outputTokens: agg._sum.outputTokens || 0n,
        cacheReadTokens: agg._sum.cacheReadTokens || 0n,
        cacheCreateTokens: agg._sum.cacheCreateTokens || 0n,
        costUsd: agg._sum.costUsd || 0,
      },
    });
  });

  // GET /v1/analytics/users — per-user leaderboard across the allowed set.
  app.get('/v1/analytics/users', { preHandler: authUser, schema: { querystring: dateQ } }, async (req) => {
    const allowed = await allowedEmails(req.actor);
    const { from, to } = window(req.query);
    const where = {
      startedAt: { gte: from, lt: to },
      ...(allowed === null ? {} : { userEmail: { in: allowed } }),
    };
    const grouped = await prisma.session.groupBy({
      by: ['userEmail'],
      where,
      _sum: { inputTokens: true, outputTokens: true, cacheReadTokens: true, cacheCreateTokens: true, costUsd: true, msgCount: true },
      _count: { _all: true },
    });
    const emails = grouped.map((g) => g.userEmail);
    const users = await prisma.analyticsUser.findMany({ where: { email: { in: emails } }, select: { email: true, name: true, role: true } });
    const nameOf = new Map(users.map((u) => [u.email, u]));
    const out = grouped.map((g) => ({
      email: g.userEmail,
      name: nameOf.get(g.userEmail)?.name || g.userEmail.split('@')[0],
      role: nameOf.get(g.userEmail)?.role || 'member',
      sessions: g._count._all,
      messages: g._sum.msgCount || 0,
      inputTokens: g._sum.inputTokens || 0n,
      outputTokens: g._sum.outputTokens || 0n,
      cacheReadTokens: g._sum.cacheReadTokens || 0n,
      cacheCreateTokens: g._sum.cacheCreateTokens || 0n,
      costUsd: g._sum.costUsd || 0,
    })).sort((a, b) => b.costUsd - a.costUsd);
    return serializeBigInts({ scope: req.actor.role, users: out });
  });

  // GET /v1/analytics/activity — daily totals for charting, across the allowed set.
  app.get('/v1/analytics/activity', { preHandler: authUser, schema: { querystring: dateQ } }, async (req) => {
    const allowed = await allowedEmails(req.actor);
    const { from, to } = window(req.query);
    const emailFilter = allowed === null ? Prisma.sql`TRUE` : Prisma.sql`"userEmail" IN (${Prisma.join(allowed)})`;
    const rows = await prisma.$queryRaw`
      SELECT to_char(date_trunc('day', "startedAt"), 'YYYY-MM-DD') AS date,
             count(*)::int AS sessions,
             COALESCE(sum("inputTokens" + "outputTokens"), 0)::bigint AS tokens,
             COALESCE(sum("costUsd"), 0) AS cost
      FROM "Session"
      WHERE "startedAt" IS NOT NULL AND ${emailFilter}
        AND "startedAt" >= ${from} AND "startedAt" < ${to}
      GROUP BY 1 ORDER BY 1`;
    return serializeBigInts({ scope: req.actor.role, activity: rows });
  });
}
