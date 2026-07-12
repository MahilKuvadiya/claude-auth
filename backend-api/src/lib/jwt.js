// Member JWT (HS256) signed with the Secret Manager JWT key. Carries { poolId, memberId }.
import jwt from 'jsonwebtoken';
import { getJwtSecret } from './secrets.js';

export async function signMemberToken({ poolId, memberId }) {
  return jwt.sign({ poolId, memberId }, await getJwtSecret(), { algorithm: 'HS256', expiresIn: '365d' });
}

export async function verifyMemberToken(token) {
  return jwt.verify(token, await getJwtSecret(), { algorithms: ['HS256'] }); // { poolId, memberId }
}
