import { prisma, pubsub } from '../../lib/clients.js';
import { authMember } from '../../plugins/auth.js';
import { config } from '../../config.js';

const TALLY_KEYS = ['tokensIn', 'tokensOut', 'cacheRead', 'cacheWrite', 'requests'];
function addInto(target, delta) {
  for (const k of TALLY_KEYS) target[k] = (target[k] || 0) + (delta[k] || 0);
  return target;
}

// POST /v1/telemetry — ingest per-request usage from a member's proxy. Member JWT.
export default async function telemetryRoute(app) {
  app.post('/v1/telemetry', {
    preHandler: authMember,
    schema: {
      body: {
        type: 'object', additionalProperties: true, properties: {
          events: {
            type: 'array', maxItems: 1000, items: {
              type: 'object', additionalProperties: true, properties: {
                servingMemberId: { type: 'string' },
                requests: { type: 'number' }, inputTokens: { type: 'number' }, outputTokens: { type: 'number' },
                cacheReadTokens: { type: 'number' }, cacheWriteTokens: { type: 'number' },
              },
            },
          },
        },
      },
    },
  }, async (req) => {
    const { poolId, memberId } = req.member;
    const events = req.body?.events || [];
    if (!Array.isArray(events) || !events.length) return { ok: true, ingested: 0 };

    const topic = pubsub.topic(config.usageTopic);
    const roll = { tokensIn: 0, tokensOut: 0, cacheRead: 0, cacheWrite: 0, requests: 0 };
    await Promise.all(events.map((ev) => {
      roll.tokensIn += ev.inputTokens || 0; roll.tokensOut += ev.outputTokens || 0;
      roll.cacheRead += ev.cacheReadTokens || 0; roll.cacheWrite += ev.cacheWriteTokens || 0;
      roll.requests += ev.requests || 1;
      return topic.publishMessage({ json: { poolId, servingMemberId: ev.servingMemberId || memberId, ...ev } })
        .catch((e) => req.log.warn({ err: e }, 'pubsub publish failed')); // ingest is best-effort
    }));

    // CONTRIBUTED = grouped by whose token actually served each request.
    const contrib = {};
    for (const ev of events) {
      const sid = ev.servingMemberId || memberId;
      addInto(contrib[sid] || (contrib[sid] = {}), {
        tokensIn: ev.inputTokens, tokensOut: ev.outputTokens,
        cacheRead: ev.cacheReadTokens, cacheWrite: ev.cacheWriteTokens, requests: ev.requests || 1,
      });
    }

    const period = new Date().toISOString().slice(0, 10);
    // Atomic scalar increments + a deep byMember merge, serialized on the rollup row.
    await prisma.$transaction(async (tx) => {
      await tx.rollup.upsert({ where: { poolId_period: { poolId, period } }, create: { poolId, period }, update: {} });
      const [cur] = await tx.$queryRaw`SELECT "byMember" FROM "Rollup" WHERE "poolId" = ${poolId} AND period = ${period} FOR UPDATE`;
      const byMember = cur?.byMember || {};
      // CONSUMED = attributed to the caller (whose proxy ran these tokens).
      const me = (byMember[memberId] ||= {});
      addInto((me.consumed ||= {}), roll);
      for (const [sid, c] of Object.entries(contrib)) {
        const entry = (byMember[sid] ||= {});
        addInto((entry.contributed ||= {}), c);
      }
      await tx.rollup.update({
        where: { poolId_period: { poolId, period } },
        data: {
          tokensIn: { increment: BigInt(roll.tokensIn) },
          tokensOut: { increment: BigInt(roll.tokensOut) },
          cacheRead: { increment: BigInt(roll.cacheRead) },
          cacheWrite: { increment: BigInt(roll.cacheWrite) },
          requests: { increment: BigInt(roll.requests) },
          byMember,
        },
      });
    });

    return { ok: true, ingested: events.length };
  });
}
