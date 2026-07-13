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

// A Prisma `where` (for the ORM) and a raw SQL email filter (for $queryRaw) that both
// apply the caller's allowed-user scope. allowed===null means admin (no restriction).
function scope(allowed) {
  return {
    where: allowed === null ? {} : { userEmail: { in: allowed } },
    sql: allowed === null ? Prisma.sql`TRUE` : Prisma.sql`s."userEmail" IN (${Prisma.join(allowed)})`,
  };
}

const TOKEN_SUM = { inputTokens: true, outputTokens: true, cacheReadTokens: true, cacheCreateTokens: true, costUsd: true, msgCount: true };

export default async function analyticsQueryRoutes(app) {
  // GET /v1/analytics/summary — headline totals + derived stats across the allowed set.
  app.get('/v1/analytics/summary', { preHandler: authUser, schema: { querystring: dateQ } }, async (req) => {
    const allowed = await allowedEmails(req.actor);
    const { from, to } = window(req.query);
    const s = scope(allowed);
    const where = { startedAt: { gte: from, lt: to }, ...s.where };
    const [agg, sessions, extra] = await Promise.all([
      prisma.session.aggregate({ where, _sum: TOKEN_SUM }),
      prisma.session.count({ where }),
      prisma.$queryRaw`
        SELECT count(DISTINCT s."userEmail")::int AS "activeUsers",
               count(DISTINCT date_trunc('day', s."startedAt"))::int AS "activeDays",
               COALESCE(avg(EXTRACT(EPOCH FROM (s."endedAt" - s."startedAt")) * 1000)
                        FILTER (WHERE s."endedAt" IS NOT NULL AND s."startedAt" IS NOT NULL), 0)::float AS "avgDurationMs"
        FROM "Session" s
        WHERE s."startedAt" >= ${from} AND s."startedAt" < ${to} AND ${s.sql}`,
    ]);
    const e = extra[0] || {};
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
        activeUsers: e.activeUsers || 0,
        activeDays: e.activeDays || 0,
        avgDurationMs: e.avgDurationMs || 0,
      },
    });
  });

  // GET /v1/analytics/users — per-user leaderboard across the allowed set.
  app.get('/v1/analytics/users', { preHandler: authUser, schema: { querystring: dateQ } }, async (req) => {
    const allowed = await allowedEmails(req.actor);
    const { from, to } = window(req.query);
    const where = { startedAt: { gte: from, lt: to }, ...scope(allowed).where };
    const grouped = await prisma.session.groupBy({
      by: ['userEmail'], where, _sum: TOKEN_SUM, _count: { _all: true },
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

  // GET /v1/analytics/activity — per-day series (all token buckets + messages + cost).
  app.get('/v1/analytics/activity', { preHandler: authUser, schema: { querystring: dateQ } }, async (req) => {
    const allowed = await allowedEmails(req.actor);
    const { from, to } = window(req.query);
    const rows = await prisma.$queryRaw`
      SELECT to_char(date_trunc('day', s."startedAt"), 'YYYY-MM-DD') AS date,
             count(*)::int AS sessions,
             COALESCE(sum(s."msgCount"), 0)::int AS messages,
             COALESCE(sum(s."inputTokens"), 0)::bigint AS "inputTokens",
             COALESCE(sum(s."outputTokens"), 0)::bigint AS "outputTokens",
             COALESCE(sum(s."cacheReadTokens"), 0)::bigint AS "cacheReadTokens",
             COALESCE(sum(s."cacheCreateTokens"), 0)::bigint AS "cacheCreateTokens",
             COALESCE(sum(s."costUsd"), 0)::float AS "costUsd"
      FROM "Session" s
      WHERE s."startedAt" IS NOT NULL AND s."startedAt" >= ${from} AND s."startedAt" < ${to} AND ${scope(allowed).sql}
      GROUP BY 1 ORDER BY 1`;
    return serializeBigInts({ scope: req.actor.role, activity: rows });
  });

  // GET /v1/analytics/breakdown?by=model|project|tool|weekday|hour — role-scoped dimension rollup.
  app.get('/v1/analytics/breakdown', {
    preHandler: authUser,
    schema: {
      querystring: {
        type: 'object',
        properties: { ...dateQ.properties, by: { type: 'string', enum: ['model', 'project', 'tool', 'weekday', 'hour'] } },
        required: ['by'],
      },
    },
  }, async (req) => {
    const allowed = await allowedEmails(req.actor);
    const { from, to } = window(req.query);
    const by = req.query.by;
    const s = scope(allowed);
    let items;

    if (by === 'model' || by === 'project') {
      const where = { startedAt: { gte: from, lt: to }, ...s.where };
      const grouped = await prisma.session.groupBy({ by: [by], where, _sum: TOKEN_SUM, _count: { _all: true } });
      items = grouped.map((g) => ({
        key: g[by] || '(unknown)',
        sessions: g._count._all,
        messages: g._sum.msgCount || 0,
        inputTokens: g._sum.inputTokens || 0n,
        outputTokens: g._sum.outputTokens || 0n,
        cacheReadTokens: g._sum.cacheReadTokens || 0n,
        cacheCreateTokens: g._sum.cacheCreateTokens || 0n,
        costUsd: g._sum.costUsd || 0,
      })).sort((a, b) => b.costUsd - a.costUsd);
    } else if (by === 'tool') {
      // Count tool_use occurrences per tool name across the allowed sessions' messages.
      items = await prisma.$queryRaw`
        SELECT t AS key, count(*)::int AS count
        FROM "Message" m
        JOIN "Session" s ON s.id = m."sessionId"
        CROSS JOIN LATERAL unnest(m."toolNames") AS t
        WHERE s."startedAt" >= ${from} AND s."startedAt" < ${to} AND ${s.sql}
        GROUP BY 1 ORDER BY 2 DESC`;
    } else {
      // weekday (0=Sun..6=Sat) or hour (0..23) session counts + tokens.
      const part = by === 'weekday' ? Prisma.sql`EXTRACT(DOW FROM s."startedAt")` : Prisma.sql`EXTRACT(HOUR FROM s."startedAt")`;
      items = await prisma.$queryRaw`
        SELECT ${part}::int AS key,
               count(*)::int AS sessions,
               COALESCE(sum(s."msgCount"), 0)::int AS messages,
               COALESCE(sum(s."inputTokens" + s."outputTokens"), 0)::bigint AS tokens,
               COALESCE(sum(s."costUsd"), 0)::float AS "costUsd"
        FROM "Session" s
        WHERE s."startedAt" IS NOT NULL AND s."startedAt" >= ${from} AND s."startedAt" < ${to} AND ${s.sql}
        GROUP BY 1 ORDER BY 1`;
    }
    return serializeBigInts({ scope: req.actor.role, by, items });
  });
}
