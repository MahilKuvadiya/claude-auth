// Member JWT (HS256) signed with the Secret Manager JWT key. Carries { poolId, memberId }.
import jwt from 'jsonwebtoken';
import { getJwtSecret } from './secrets.js';

export async function signMemberToken({ poolId, memberId }) {
  return jwt.sign({ poolId, memberId }, await getJwtSecret(), { algorithm: 'HS256', expiresIn: '365d' });
}

export async function verifyMemberToken(token) {
  return jwt.verify(token, await getJwtSecret(), { algorithms: ['HS256'] }); // { poolId, memberId }
}

// Analytics collector token — self-scoped to one user's email. Carries { sub, kind }.
export async function signAnalyticsToken({ email }) {
  return jwt.sign({ sub: email.toLowerCase(), kind: 'analytics' }, await getJwtSecret(), {
    algorithm: 'HS256', expiresIn: '365d',
  });
}

export async function verifyAnalyticsToken(token) {
  const p = jwt.verify(token, await getJwtSecret(), { algorithms: ['HS256'] });
  if (p.kind !== 'analytics' || !p.sub) throw new Error('not an analytics token');
  return p; // { sub, kind }
}
