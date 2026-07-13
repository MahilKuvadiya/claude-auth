import { prisma } from '../../lib/clients.js';
import { authAnalytics } from '../../plugins/auth.js';
import { ensureUser } from '../../lib/rbac.js';
import { costFor } from '../../lib/pricing.js';

const msgItem = {
  type: 'object', required: ['uuid', 'sessionId', 'role'], additionalProperties: true,
  properties: {
    uuid: { type: 'string' }, sessionId: { type: 'string' },
    role: { type: 'string' }, seq: { type: 'integer' },
    text: { type: ['string', 'null'] }, thinking: { type: ['string', 'null'] },
    model: { type: ['string', 'null'] }, ts: { type: ['string', 'null'] },
    durationMs: { type: ['integer', 'null'] },
    inputTokens: { type: 'integer' }, outputTokens: { type: 'integer' },
    cacheReadTokens: { type: 'integer' }, cacheCreateTokens: { type: 'integer' },
    toolNames: { type: 'array', items: { type: 'string' } },
    isSidechain: { type: 'boolean' },
  },
};

const toDate = (v) => { const d = v ? new Date(v) : null; return d && !isNaN(d) ? d : null; };
const int = (v) => (Number.isFinite(v) ? Math.max(0, Math.trunc(v)) : 0);

// POST /v1/analytics/ingest — the collector POSTs deltas (new transcript turns). Self-scoped:
// userEmail is taken from the token, never the body. Idempotent — messages upsert by uuid,
// session rollups are recomputed from the DB, so re-sending the same batch changes nothing.
export default async function ingestRoute(app) {
  app.post('/v1/analytics/ingest', {
    preHandler: authAnalytics,
    schema: {
      body: {
        type: 'object', additionalProperties: true,
        properties: {
          sessions: { type: 'array', maxItems: 2000, items: { type: 'object', additionalProperties: true } },
          messages: { type: 'array', maxItems: 20000, items: msgItem },
          syncState: { type: 'array', maxItems: 5000, items: { type: 'object', additionalProperties: true } },
        },
      },
    },
  }, async (req) => {
    const email = req.subject;
    await ensureUser(email);
    const sessions = req.body?.sessions || [];
    const messages = req.body?.messages || [];
    const syncState = req.body?.syncState || [];

    // 1) Sessions: only touch rows owned by this email (never hijack another user's id).
    const incomingIds = [...new Set(sessions.map((s) => s.id).concat(messages.map((m) => m.sessionId)).filter(Boolean))];
    const existing = await prisma.session.findMany({
      where: { id: { in: incomingIds } }, select: { id: true, userEmail: true },
    });
    const ownerOf = new Map(existing.map((s) => [s.id, s.userEmail]));
    const valid = new Set(incomingIds.filter((id) => !ownerOf.has(id) || ownerOf.get(id) === email));
    const meta = new Map(sessions.map((s) => [s.id, s]));

    for (const id of valid) {
      const s = meta.get(id) || {};
      await prisma.session.upsert({
        where: { id },
        create: { id, userEmail: email, project: s.project || null, gitBranch: s.gitBranch || null, model: s.model || null },
        update: {
          ...(s.project ? { project: s.project } : {}),
          ...(s.gitBranch ? { gitBranch: s.gitBranch } : {}),
          ...(s.model ? { model: s.model } : {}),
        },
      });
    }

    // 2) Messages: append-only + immutable → createMany skipDuplicates is perfectly idempotent.
    const rows = messages.filter((m) => valid.has(m.sessionId)).map((m) => ({
      uuid: m.uuid, sessionId: m.sessionId, role: m.role, seq: int(m.seq),
      text: m.text ?? null, thinking: m.thinking ?? null, model: m.model ?? null,
      ts: toDate(m.ts), durationMs: Number.isFinite(m.durationMs) ? m.durationMs : null,
      inputTokens: int(m.inputTokens), outputTokens: int(m.outputTokens),
      cacheReadTokens: int(m.cacheReadTokens), cacheCreateTokens: int(m.cacheCreateTokens),
      toolNames: Array.isArray(m.toolNames) ? m.toolNames : [],
      isSidechain: !!m.isSidechain,
    }));
    let inserted = 0;
    if (rows.length) {
      const r = await prisma.message.createMany({ data: rows, skipDuplicates: true });
      inserted = r.count;
    }

    // 3) Recompute session rollups from the DB (idempotent). Group by (session, model) so
    //    cost can use per-model rates; aggregate up to the session.
    const touched = [...new Set(rows.map((m) => m.sessionId))];
    for (const sessionId of touched) {
      const g = await prisma.message.groupBy({
        by: ['model'],
        where: { sessionId },
        _count: { _all: true },
        _sum: { inputTokens: true, outputTokens: true, cacheReadTokens: true, cacheCreateTokens: true },
        _min: { ts: true }, _max: { ts: true },
      });
      const agg = { msgCount: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreateTokens: 0, costUsd: 0 };
      let startedAt = null, endedAt = null, topModel = null, topCount = -1;
      for (const row of g) {
        const s = row._sum;
        agg.msgCount += row._count._all;
        agg.inputTokens += s.inputTokens || 0;
        agg.outputTokens += s.outputTokens || 0;
        agg.cacheReadTokens += s.cacheReadTokens || 0;
        agg.cacheCreateTokens += s.cacheCreateTokens || 0;
        agg.costUsd += costFor(row.model, {
          input: s.inputTokens || 0, output: s.outputTokens || 0,
          cacheRead: s.cacheReadTokens || 0, cacheWrite: s.cacheCreateTokens || 0,
        });
        if (row._min.ts && (!startedAt || row._min.ts < startedAt)) startedAt = row._min.ts;
        if (row._max.ts && (!endedAt || row._max.ts > endedAt)) endedAt = row._max.ts;
        if (row.model && row._count._all > topCount) { topCount = row._count._all; topModel = row.model; }
      }
      await prisma.session.update({
        where: { id: sessionId },
        data: {
          msgCount: agg.msgCount,
          inputTokens: BigInt(agg.inputTokens), outputTokens: BigInt(agg.outputTokens),
          cacheReadTokens: BigInt(agg.cacheReadTokens), cacheCreateTokens: BigInt(agg.cacheCreateTokens),
          costUsd: agg.costUsd, startedAt, endedAt,
          ...(topModel ? { model: topModel } : {}),
        },
      });
    }

    // 4) Per-file byte offsets so the next sync only reads the delta.
    for (const st of syncState) {
      if (!st.filePath) continue;
      await prisma.syncState.upsert({
        where: { userEmail_filePath: { userEmail: email, filePath: st.filePath } },
        create: { userEmail: email, filePath: st.filePath, byteOffset: BigInt(int(st.byteOffset)), mtime: st.mtime ?? null },
        update: { byteOffset: BigInt(int(st.byteOffset)), mtime: st.mtime ?? null },
      });
    }

    return { ok: true, sessions: valid.size, messagesReceived: rows.length, messagesInserted: inserted, touchedSessions: touched.length };
  });

  // GET /v1/analytics/sync-state — the collector fetches its saved offsets to resume.
  app.get('/v1/analytics/sync-state', { preHandler: authAnalytics }, async (req) => {
    const rows = await prisma.syncState.findMany({
      where: { userEmail: req.subject },
      select: { filePath: true, byteOffset: true, mtime: true },
    });
    return { syncState: rows.map((r) => ({ filePath: r.filePath, byteOffset: Number(r.byteOffset), mtime: r.mtime })) };
  });
}
