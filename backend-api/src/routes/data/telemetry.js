import { FieldValue } from '@google-cloud/firestore';
import { db, pubsub } from '../../lib/clients.js';
import { authMember } from '../../plugins/auth.js';
import { config } from '../../config.js';

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

    const inc = FieldValue.increment;
    // CONSUMED = attributed to the caller (whose proxy ran these tokens).
    const consumed = {
      tokensIn: inc(roll.tokensIn), tokensOut: inc(roll.tokensOut),
      cacheRead: inc(roll.cacheRead), cacheWrite: inc(roll.cacheWrite), requests: inc(roll.requests),
    };
    // CONTRIBUTED = grouped by whose token actually served each request.
    const contrib = {};
    for (const ev of events) {
      const sid = ev.servingMemberId || memberId;
      const c = contrib[sid] || (contrib[sid] = { tokensIn: 0, tokensOut: 0, cacheRead: 0, cacheWrite: 0, requests: 0 });
      c.tokensIn += ev.inputTokens || 0; c.tokensOut += ev.outputTokens || 0;
      c.cacheRead += ev.cacheReadTokens || 0; c.cacheWrite += ev.cacheWriteTokens || 0; c.requests += ev.requests || 1;
    }
    const byMember = { [memberId]: { consumed } };
    for (const [sid, c] of Object.entries(contrib)) {
      byMember[sid] = byMember[sid] || {};
      byMember[sid].contributed = {
        tokensIn: inc(c.tokensIn), tokensOut: inc(c.tokensOut),
        cacheRead: inc(c.cacheRead), cacheWrite: inc(c.cacheWrite), requests: inc(c.requests),
      };
    }

    const period = new Date().toISOString().slice(0, 10);
    await db.collection('pools').doc(poolId).collection('rollups').doc(period).set({
      tokensIn: inc(roll.tokensIn), tokensOut: inc(roll.tokensOut),
      cacheRead: inc(roll.cacheRead), cacheWrite: inc(roll.cacheWrite), requests: inc(roll.requests),
      byMember, updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    return { ok: true, ingested: events.length };
  });
}
