import { prisma } from '../../lib/clients.js';
import { writeRefreshToken, secretName } from '../../lib/secrets.js';
import { signMemberToken } from '../../lib/jwt.js';

// POST /v1/pools/join — the single-use join token IS the credential (no bearer auth).
export default async function joinRoute(app) {
  app.post('/v1/pools/join', {
    schema: {
      body: {
        type: 'object', required: ['joinToken', 'email', 'refreshToken'], additionalProperties: true,
        properties: {
          joinToken: { type: 'string' }, email: { type: 'string', format: 'email' },
          accountUuid: { type: ['string', 'null'] }, refreshToken: { type: 'string' },
        },
      },
    },
  }, async (req) => {
    const { joinToken, email, accountUuid, refreshToken } = req.body;

    // 1) validate WITHOUT mutating
    const l = await prisma.joinLink.findUnique({ where: { token: joinToken } });
    if (!l) throw Object.assign(new Error('invalid link'), { statusCode: 404, code: 'invalid_link' });
    if (l.usedAt) throw Object.assign(new Error('link already used'), { statusCode: 409, code: 'link_used' });
    if (l.expiresAt && l.expiresAt.getTime() < Date.now())
      throw Object.assign(new Error('link expired'), { statusCode: 410, code: 'link_expired' });
    if (String(l.targetEmail).toLowerCase() !== String(email).toLowerCase())
      throw Object.assign(new Error('this link is for a different account'), { statusCode: 403, code: 'link_wrong_account' });

    const memberId = accountUuid || email.split('@')[0];

    // 2) store the refresh token FIRST — if this fails, the link is untouched and reusable
    await writeRefreshToken(l.poolId, memberId, refreshToken);

    // 3) transactionally burn the link + create the member — the row lock re-checks
    //    unused so a racing join can't reuse the same single-use token.
    await prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw`SELECT "usedAt" FROM "JoinLink" WHERE token = ${joinToken} FOR UPDATE`;
      if (locked[0]?.usedAt) throw Object.assign(new Error('link already used'), { statusCode: 409, code: 'link_used' });
      await tx.member.upsert({
        where: { poolId_memberId: { poolId: l.poolId, memberId } },
        create: {
          poolId: l.poolId, memberId, email, accountUuid: accountUuid || null,
          poolRole: l.role || 'member', status: 'active', secretRef: secretName(l.poolId, memberId),
        },
        update: {
          email, accountUuid: accountUuid || null, poolRole: l.role || 'member',
          status: 'active', secretRef: secretName(l.poolId, memberId),
        },
      });
      await tx.joinLink.update({ where: { token: joinToken }, data: { usedAt: new Date(), memberId } });
    });

    const memberToken = await signMemberToken({ poolId: l.poolId, memberId });
    return { poolId: l.poolId, memberId, memberToken };
  });
}
