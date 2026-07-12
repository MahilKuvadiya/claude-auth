import { FieldValue } from '@google-cloud/firestore';
import { db } from '../../lib/clients.js';
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
    const linkRef = db.collection('joinLinks').doc(joinToken);

    // 1) validate WITHOUT mutating
    const linkSnap = await linkRef.get();
    if (!linkSnap.exists) throw Object.assign(new Error('invalid link'), { statusCode: 404, code: 'invalid_link' });
    const l = linkSnap.data();
    if (l.usedAt) throw Object.assign(new Error('link already used'), { statusCode: 409, code: 'link_used' });
    if (l.expiresAt && l.expiresAt.toMillis() < Date.now())
      throw Object.assign(new Error('link expired'), { statusCode: 410, code: 'link_expired' });
    if (String(l.targetEmail).toLowerCase() !== String(email).toLowerCase())
      throw Object.assign(new Error('this link is for a different account'), { statusCode: 403, code: 'link_wrong_account' });

    const memberId = accountUuid || email.split('@')[0];

    // 2) store the refresh token FIRST — if this fails, the link is untouched and reusable
    await writeRefreshToken(l.poolId, memberId, refreshToken);

    // 3) transactionally burn the link + create the member (re-check unused = single-use safety)
    await db.runTransaction(async (tx) => {
      const fresh = await tx.get(linkRef);
      if (fresh.data().usedAt) throw Object.assign(new Error('link already used'), { statusCode: 409, code: 'link_used' });
      const mRef = db.collection('pools').doc(l.poolId).collection('members').doc(memberId);
      tx.set(mRef, {
        email, accountUuid: accountUuid || null, role: l.role || 'member', status: 'active',
        secretRef: secretName(l.poolId, memberId), joinedAt: FieldValue.serverTimestamp(),
        accessToken: null, accessExpiresAt: null,
      }, { merge: true });
      tx.update(linkRef, { usedAt: FieldValue.serverTimestamp(), memberId });
    });

    const memberToken = await signMemberToken({ poolId: l.poolId, memberId });
    return { poolId: l.poolId, memberId, memberToken };
  });
}
