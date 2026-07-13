// Central RBAC. Roles live in Postgres (AnalyticsUser.role); this is the single place
// that resolves a caller's role and computes the set of users whose data they may read.
// NEVER trust a role asserted by the client — always resolve server-side from here.
import { prisma } from './clients.js';
import { config } from '../config.js';

export const ROLES = ['admin', 'pod_lead', 'member'];

/** Resolve a caller's effective role from their email. Bootstrap admins always win. */
export async function resolveRole(email) {
  const e = String(email || '').toLowerCase();
  if (!e) return 'member';
  if (config.adminEmails.includes(e)) return 'admin';
  const u = await prisma.analyticsUser.findUnique({ where: { email: e }, select: { role: true } });
  return u?.role || 'member';
}

/** Full actor descriptor for an authenticated identity (role + org). */
export async function resolveActor(email) {
  const e = String(email || '').toLowerCase();
  const [role, u] = await Promise.all([
    resolveRole(e),
    prisma.analyticsUser.findUnique({ where: { email: e }, select: { orgId: true } }),
  ]);
  return { email: e, role, orgId: u?.orgId || null };
}

/** Idempotently ensure an AnalyticsUser row exists (used by enroll + provisioning). */
export async function ensureUser(email, { name = null, orgId = null } = {}) {
  const e = String(email).toLowerCase();
  const role = config.adminEmails.includes(e) ? 'admin' : undefined; // don't downgrade existing
  return prisma.analyticsUser.upsert({
    where: { email: e },
    create: { email: e, name, orgId, ...(role ? { role } : {}) },
    update: { ...(name ? { name } : {}), ...(role ? { role } : {}) },
  });
}

/**
 * The set of user-emails whose metrics/sessions `actor` may read.
 *   admin    → null  (means "everyone" — apply no userEmail filter)
 *   pod_lead → members of every pod they lead, plus themselves
 *   member   → just themselves
 * Returns null (all) or a lowercased email array.
 */
export async function allowedEmails(actor) {
  if (actor.role === 'admin') return null;
  const self = actor.email.toLowerCase();
  if (actor.role !== 'pod_lead') return [self];
  const memberships = await prisma.podMembership.findMany({
    where: { pod: { leadEmail: self } },
    select: { userEmail: true },
  });
  return [...new Set([self, ...memberships.map((m) => m.userEmail.toLowerCase())])];
}

/** Build a Prisma `where` fragment scoping a userEmail column to the actor's allowed set. */
export async function scopeUserEmail(actor, field = 'userEmail') {
  const allowed = await allowedEmails(actor);
  if (allowed === null) return {}; // admin — no restriction
  return { [field]: { in: allowed } };
}

function httpError(statusCode, code, message) {
  return Object.assign(new Error(message), { statusCode, code });
}

export function assertRole(actor, ...roles) {
  if (!roles.includes(actor.role)) throw httpError(403, 'forbidden', `requires role: ${roles.join(' or ')}`);
}

/** Session CONTENT (raw prompt/response text) is admin-only — the hard gate. */
export function assertCanReadSessions(actor) {
  if (actor.role !== 'admin') throw httpError(403, 'forbidden', 'session content is admin-only');
}

/** May `actor` read `targetEmail`'s metrics? */
export async function assertCanReadUser(actor, targetEmail) {
  const allowed = await allowedEmails(actor);
  if (allowed === null) return;
  if (!allowed.includes(String(targetEmail).toLowerCase()))
    throw httpError(403, 'forbidden', 'not permitted to view this user');
}
