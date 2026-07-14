import { prisma, serializeBigInts } from '../../lib/clients.js';
import { authAdmin } from '../../plugins/auth.js';

// Session CONTENT (raw prompt/response text) is ADMIN-ONLY — the hard gate. Every route
// here is authAdmin; pod_leads and members can never reach transcript text.
export default async function analyticsSessionsRoutes(app) {
  // GET /v1/analytics/sessions — list session metadata (filter by user/project/date).
  app.get('/v1/analytics/sessions', {
    preHandler: authAdmin,
    schema: {
      querystring: {
        type: 'object',
        properties: {
          user: { type: 'string' }, project: { type: 'string' }, model: { type: 'string' },
          from: { type: 'string' }, to: { type: 'string' },
          sort: { type: 'string', enum: ['recent', 'cost', 'tokens', 'duration', 'msgs'], default: 'recent' },
          limit: { type: 'integer', minimum: 1, maximum: 200, default: 50 },
          offset: { type: 'integer', minimum: 0, default: 0 },
        },
      },
    },
  }, async (req) => {
    const q = req.query;
    const where = {
      ...(q.user ? { userEmail: q.user.toLowerCase() } : {}),
      ...(q.project ? { project: { contains: q.project } } : {}),
      ...(q.model ? { model: q.model } : {}),
      ...(q.from || q.to ? { startedAt: { ...(q.from ? { gte: new Date(q.from) } : {}), ...(q.to ? { lt: new Date(q.to) } : {}) } } : {}),
    };
    // "duration" isn't a column — approximate by endedAt desc; the rest map to columns.
    const orderBy = {
      recent: { startedAt: 'desc' }, cost: { costUsd: 'desc' },
      tokens: { outputTokens: 'desc' }, duration: { endedAt: 'desc' }, msgs: { msgCount: 'desc' },
    }[q.sort || 'recent'];
    const [sessions, total] = await Promise.all([
      prisma.session.findMany({
        where, orderBy, take: q.limit || 50, skip: q.offset || 0,
        select: {
          id: true, userEmail: true, project: true, gitBranch: true, model: true,
          startedAt: true, endedAt: true, msgCount: true,
          inputTokens: true, outputTokens: true, cacheReadTokens: true, cacheCreateTokens: true, costUsd: true,
        },
      }),
      prisma.session.count({ where }),
    ]);
    return serializeBigInts({ total, sessions });
  });

  // GET /v1/analytics/sessions/:id — full prompt→response thread (CONTENT).
  app.get('/v1/analytics/sessions/:id', { preHandler: authAdmin }, async (req) => {
    const session = await prisma.session.findUnique({ where: { id: req.params.id } });
    if (!session) throw Object.assign(new Error('session not found'), { statusCode: 404, code: 'not_found' });
    const messages = await prisma.message.findMany({
      where: { sessionId: session.id },
      orderBy: [{ seq: 'asc' }, { ts: 'asc' }],
      select: {
        uuid: true, role: true, seq: true, text: true, thinking: true, model: true, ts: true,
        durationMs: true, inputTokens: true, outputTokens: true, cacheReadTokens: true,
        cacheCreateTokens: true, toolNames: true, isSidechain: true,
      },
    });
    return serializeBigInts({ session, messages });
  });
}
