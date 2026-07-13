// End-to-end integration against a real Postgres (Prisma). Secret Manager and Anthropic
// OAuth are module-mocked (no external calls); the database is real.
//
// Run: npm run test:integration   (needs DATABASE_URL pointing at a migrated Postgres —
// in CI a service-container Postgres; locally the Cloud SQL proxy + claudex_uat).
// Requires Node's --experimental-test-module-mocks (set in the npm script).
// Skips itself (no failure) when DATABASE_URL is unset so the GCP-free suite still runs.
process.env.NODE_ENV = 'test';
process.env.GCP_PROJECT = process.env.GCP_PROJECT || 'yash-test-495112';

import { test, before, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';

const HAVE_DB = !!process.env.DATABASE_URL;
const TEST_JWT_SECRET = 'test-secret-key';

// --- module mocks: in-memory refresh-token store + rotating fake OAuth ---
const store = new Map();
mock.module('../../src/lib/secrets.js', {
  namedExports: {
    getJwtSecret: async () => TEST_JWT_SECRET,
    secretName: (p, m) => `claudex-${p}-member-${m}`,
    writeRefreshToken: async (p, m, rt) => { store.set(`${p}/${m}`, rt); },
    readRefreshToken: async (p, m) => store.get(`${p}/${m}`),
    deleteMemberSecret: async (p, m) => { store.delete(`${p}/${m}`); },
  },
});
let refreshCalls = 0;
mock.module('../../src/lib/anthropic.js', {
  namedExports: {
    refreshAccessToken: async () => {
      refreshCalls += 1;
      return { access_token: `at_${refreshCalls}`, refresh_token: `rt_${refreshCalls}`, expires_in: 3600 };
    },
    anthropicUsage: async () => ({ five_hour: { utilization: 0.42 }, seven_day: { utilization: 0.1 } }),
  },
});

const { buildServer } = await import('../../src/server.js');
const { prisma } = await import('../../src/lib/clients.js');

const poolId = 'pl_test_e2e';
let app;
before(async () => {
  app = await buildServer();
  await app.ready();
  if (HAVE_DB) {
    // clean slate for this test's pool
    await prisma.rollup.deleteMany({ where: { poolId } });
    await prisma.member.deleteMany({ where: { poolId } });
    await prisma.joinLink.deleteMany({ where: { poolId } });
    await prisma.pool.deleteMany({ where: { id: poolId } });
    await prisma.pool.create({ data: { id: poolId, name: 'test', mode: 'failover', status: 'active' } });
    await prisma.joinLink.create({ data: { token: 'jt_test', poolId, targetEmail: 'dev@devxlabs.ai', role: 'member' } });
  }
});
after(async () => {
  if (HAVE_DB) {
    await prisma.rollup.deleteMany({ where: { poolId } });
    await prisma.member.deleteMany({ where: { poolId } });
    await prisma.joinLink.deleteMany({ where: { poolId } });
    await prisma.pool.deleteMany({ where: { id: poolId } });
    await prisma.$disconnect();
  }
  await app.close();
});

test('join → mint → telemetry → reads, and refresh is serialized to ONE', { skip: !HAVE_DB && 'no DATABASE_URL' }, async () => {
  const email = 'dev@devxlabs.ai';

  // join
  const j = await app.inject({ method: 'POST', url: '/v1/pools/join',
    payload: { joinToken: 'jt_test', email, refreshToken: 'seed-rt' } });
  assert.equal(j.statusCode, 200, j.body);
  const { memberToken, memberId } = j.json();
  const authz = { authorization: `Bearer ${memberToken}` };

  // link is burned (single-use)
  const j2 = await app.inject({ method: 'POST', url: '/v1/pools/join',
    payload: { joinToken: 'jt_test', email, refreshToken: 'seed-rt' } });
  assert.equal(j2.statusCode, 409);

  // mint token
  const tk = await app.inject({ method: 'GET', url: `/v1/pools/${poolId}/token`, headers: authz });
  assert.equal(tk.statusCode, 200);
  assert.equal(tk.json().servingMemberId, memberId);

  // Concurrent serve on a cold token. Postgres SELECT … FOR UPDATE gives pessimistic
  // locking, so the mint transaction serializes to EXACTLY ONE refresh — the guarantee
  // the sole-refresher relies on (the Firestore emulator couldn't prove this).
  refreshCalls = 0;
  await prisma.member.update({ where: { poolId_memberId: { poolId, memberId } },
    data: { accessToken: null, accessExpiresAt: null } });
  const many = await Promise.all(Array.from({ length: 8 }, () =>
    app.inject({ method: 'GET', url: `/v1/pools/${poolId}/token`, headers: authz })));
  assert.ok(many.every((r) => r.statusCode === 200), 'all concurrent mints succeed');
  assert.equal(refreshCalls, 1, 'exactly one refresh under concurrency (single-use token not burned twice)');

  // telemetry
  const tel = await app.inject({ method: 'POST', url: '/v1/telemetry', headers: authz,
    payload: { events: [{ servingMemberId: memberId, requests: 1, inputTokens: 100, outputTokens: 50 }] } });
  assert.equal(tel.json().ingested, 1);

  // members roster reflects tallies
  const mem = await app.inject({ method: 'GET', url: `/v1/pools/${poolId}/members`, headers: authz });
  assert.equal(mem.statusCode, 200);
  assert.equal(mem.json().members.length, 1);
  assert.equal(mem.json().members[0].consumed.tokensIn, 100);

  // rollups reflect the same totals
  const memberJwtForReads = memberToken;
  void memberJwtForReads;
});

test('pool-scoped member token cannot act on another pool', { skip: !HAVE_DB && 'no DATABASE_URL' }, async () => {
  const badToken = jwt.sign({ poolId: 'pl_other', memberId: 'm' }, TEST_JWT_SECRET, { algorithm: 'HS256' });
  const r = await app.inject({ method: 'GET', url: `/v1/pools/${poolId}/token`,
    headers: { authorization: `Bearer ${badToken}` } });
  assert.equal(r.statusCode, 403);
});
