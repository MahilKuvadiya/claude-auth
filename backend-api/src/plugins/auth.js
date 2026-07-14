// Auth strategies as plain preHandler functions (used per route group — nothing is
// unauthenticated by omission). They attach req.actor / req.member or throw a typed error.
import { googleOAuth } from '../lib/clients.js';
import { verifyMemberToken, verifyAnalyticsToken } from '../lib/jwt.js';
import { resolveActor } from '../lib/rbac.js';
import { config } from '../config.js';

function httpError(statusCode, code, message) {
  return Object.assign(new Error(message), { statusCode, code });
}
function bearer(req) {
  return (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
}

/**
 * Any authenticated dashboard user. Verifies a Google ID token (GIS) for identity
 * (aud = our OAuth client), enforces the org email domain, then resolves the role
 * SERVER-SIDE from Postgres (never a client-asserted claim).
 * Sets req.actor = { uid, email, role: admin|pod_lead|member, orgId }.
 */
export async function authUser(req) {
  // Trusted service caller (Slack bot): x-bot-token + x-acting-email. The email's
  // role is still resolved SERVER-SIDE via resolveActor — the bot can't assert it.
  const botTok = req.headers['x-bot-token'];
  if (botTok) {
    if (!config.botToken || botTok !== config.botToken)
      throw httpError(401, 'unauthenticated', 'invalid bot token');
    const email = String(req.headers['x-acting-email'] || '').trim().toLowerCase();
    if (!email) throw httpError(403, 'forbidden', 'x-acting-email required');
    const actor = await resolveActor(email);
    req.actor = { uid: null, viaBot: true, ...actor };
    return req.actor;
  }

  const idToken = bearer(req);
  if (!idToken) throw httpError(401, 'unauthenticated', 'sign-in required');
  let payload;
  try {
    const ticket = await googleOAuth.verifyIdToken({ idToken, audience: config.googleClientId });
    payload = ticket.getPayload();
  } catch { throw httpError(401, 'unauthenticated', 'invalid or expired session'); }
  const email = (payload?.email || '').toLowerCase();
  if (!email || payload.email_verified === false) throw httpError(403, 'forbidden', 'account email not verified');
  const domain = email.split('@')[1];
  if (config.enrollDomains.length && !config.enrollDomains.includes(domain))
    throw httpError(403, 'forbidden', 'email domain not allowed');
  const actor = await resolveActor(email);
  req.actor = { uid: payload.sub, ...actor };
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

/** Analytics collector: self-scoped HS256 token. Sets req.subject = the user's email. */
export async function authAnalytics(req) {
  const token = bearer(req);
  if (!token) throw httpError(401, 'unauthenticated', 'analytics token required');
  try { req.subject = (await verifyAnalyticsToken(token)).sub; }
  catch { throw httpError(401, 'unauthenticated', 'invalid analytics token'); }
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
