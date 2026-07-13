// RBAC matrix against real Postgres. Firebase Admin is module-mocked so a bearer token
// is just base64(JSON {uid,email}); the ROLE is resolved server-side from Postgres +
// ADMIN_EMAILS — exactly the trust model in prod. Skips without DATABASE_URL.
process.env.NODE_ENV = 'test';
process.env.GCP_PROJECT = process.env.GCP_PROJECT || 'yash-test-495112';
process.env.ADMIN_EMAILS = 'boss@devxlabs.ai';

import { test, before, after, mock } from 'node:test';
import assert from 'node:assert/strict';

const HAVE_DB = !!process.env.DATABASE_URL;

mock.module('firebase-admin', {
  defaultExport: {
    apps: [{}],
    initializeApp: () => {},
    auth: () => ({ verifyIdToken: async (t) => JSON.parse(Buffer.from(t, 'base64').toString('utf8')) }),
  },
});

const { buildServer } = await import('../../src/server.js');
const { prisma } = await import('../../src/lib/clients.js');

// token helpers
const tok = (email) => Buffer.from(JSON.stringify({ uid: email, email }), 'utf8').toString('base64');
const H = (email) => ({ authorization: `Bearer ${tok(email)}` });
const ADMIN = 'boss@devxlabs.ai';
const LEAD = 'lead@devxlabs.ai';
const MEMBER = 'ic@devxlabs.ai';

let app;
before(async () => {
  app = await buildServer();
  await app.ready();
  if (HAVE_DB) {
    await prisma.podMembership.deleteMany({ where: { userEmail: { in: [LEAD, MEMBER] } } });
    await prisma.pod.deleteMany({ where: { leadEmail: LEAD } });
    await prisma.analyticsUser.deleteMany({ where: { email: { in: [LEAD, MEMBER, ADMIN] } } });
  }
});
after(async () => {
  if (HAVE_DB) {
    await prisma.podMembership.deleteMany({ where: { userEmail: { in: [LEAD, MEMBER] } } });
    await prisma.pod.deleteMany({ where: { leadEmail: LEAD } });
    await prisma.analyticsUser.deleteMany({ where: { email: { in: [LEAD, MEMBER, ADMIN] } } });
    await prisma.$disconnect();
  }
  await app.close();
});

const skip = !HAVE_DB && 'no DATABASE_URL';

test('bootstrap admin can manage users + pods', { skip }, async () => {
  // admin lists users (empty-ish) — 200
  let r = await app.inject({ method: 'GET', url: '/v1/admin/users', headers: H(ADMIN) });
  assert.equal(r.statusCode, 200, r.body);

  // admin grants LEAD the pod_lead role
  r = await app.inject({ method: 'PUT', url: `/v1/admin/users/${LEAD}/role`, headers: H(ADMIN), payload: { role: 'pod_lead' } });
  assert.equal(r.statusCode, 200);
  assert.equal(r.json().role, 'pod_lead');

  // admin creates a pod led by LEAD, adds MEMBER
  r = await app.inject({ method: 'POST', url: '/v1/admin/pods', headers: H(ADMIN), payload: { name: 'Pod A', leadEmail: LEAD } });
  assert.equal(r.statusCode, 201, r.body);
  const podId = r.json().id;
  r = await app.inject({ method: 'POST', url: `/v1/admin/pods/${podId}/members`, headers: H(ADMIN), payload: { email: MEMBER } });
  assert.equal(r.statusCode, 201);
});

test('non-admins are refused pod/role management', { skip }, async () => {
  for (const who of [LEAD, MEMBER]) {
    const r = await app.inject({ method: 'GET', url: '/v1/admin/users', headers: H(who) });
    assert.equal(r.statusCode, 403, `${who} must not manage users`);
  }
});

test('pool creation: admin + pod_lead allowed, member forbidden', { skip }, async () => {
  const a = await app.inject({ method: 'POST', url: '/v1/pools', headers: H(ADMIN), payload: { name: 'p-admin' } });
  assert.equal(a.statusCode, 201, a.body);
  const l = await app.inject({ method: 'POST', url: '/v1/pools', headers: H(LEAD), payload: { name: 'p-lead' } });
  assert.equal(l.statusCode, 201, l.body);
  const m = await app.inject({ method: 'POST', url: '/v1/pools', headers: H(MEMBER), payload: { name: 'p-ic' } });
  assert.equal(m.statusCode, 403, 'member cannot create pools');

  // cleanup the two created pools
  if (HAVE_DB) await prisma.pool.deleteMany({ where: { id: { in: [a.json().id, l.json().id] } } });
});

test('unauthenticated → 401', { skip }, async () => {
  const r = await app.inject({ method: 'GET', url: '/v1/admin/users' });
  assert.equal(r.statusCode, 401);
});
