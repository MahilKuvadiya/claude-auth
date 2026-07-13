// Auth strategies as plain preHandler functions (used per route group — nothing is
// unauthenticated by omission). They attach req.actor / req.member or throw a typed error.
import { firebaseAuth } from '../lib/clients.js';
import { verifyMemberToken } from '../lib/jwt.js';
import { resolveActor } from '../lib/rbac.js';

function httpError(statusCode, code, message) {
  return Object.assign(new Error(message), { statusCode, code });
}
function bearer(req) {
  return (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
}

/**
 * Any authenticated dashboard user. Verifies the Firebase ID token for identity, then
 * resolves the role SERVER-SIDE from Postgres (never from a client-asserted claim).
 * Sets req.actor = { uid, email, role: admin|pod_lead|member, orgId }.
 */
export async function authUser(req) {
  const idToken = bearer(req);
  if (!idToken) throw httpError(401, 'unauthenticated', 'sign-in required');
  let decoded;
  try { decoded = await firebaseAuth.verifyIdToken(idToken); }
  catch { throw httpError(401, 'unauthenticated', 'invalid or expired session'); }
  if (!decoded.email) throw httpError(403, 'forbidden', 'account has no email');
  const actor = await resolveActor(decoded.email);
  req.actor = { uid: decoded.uid, ...actor };
  return req.actor;
}

/** Control-plane (pool management): an authenticated user with an elevated role. */
export async function authFirebase(req) {
  await authUser(req);
  if (req.actor.role !== 'admin' && req.actor.role !== 'pod_lead')
    throw httpError(403, 'forbidden', 'admin access required');
}

/** Admin-only preHandler (pod/role management, session content). */
export async function authAdmin(req) {
  await authUser(req);
  if (req.actor.role !== 'admin') throw httpError(403, 'forbidden', 'admin access required');
}

/** Data-plane: member HS256 JWT. Sets req.member = { poolId, memberId }. */
export async function authMember(req) {
  const token = bearer(req);
  if (!token) throw httpError(401, 'unauthenticated', 'member token required');
  try { req.member = await verifyMemberToken(token); }
  catch { throw httpError(401, 'unauthenticated', 'invalid member token'); }
}

/** Shared read (roster): accept either a member JWT or a Firebase admin token. */
export async function authMemberOrFirebase(req) {
  const token = bearer(req);
  if (!token) throw httpError(401, 'unauthenticated', 'authorization required');
  try { req.member = await verifyMemberToken(token); return; } catch { /* try firebase */ }
  await authFirebase(req);
}

/**
 * Enforce that a member token may only act on its own pool. Call inside data-plane
 * handlers after authMember when the pool id is in the path.
 */
export function assertPoolScope(req, poolIdFromPath) {
  if (req.member && req.member.poolId !== poolIdFromPath)
    throw httpError(403, 'forbidden', 'token is scoped to a different pool');
}
