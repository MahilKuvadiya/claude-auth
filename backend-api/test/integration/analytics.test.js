// Analytics ingest + query against real Postgres. secrets.js (JWT key) and firebase-admin
// are module-mocked. Verifies: enroll, idempotent/incremental ingest, role-scoped metrics,
// and the admin-only session-content gate. Skips without DATABASE_URL.
process.env.NODE_ENV = 'test';
process.env.GCP_PROJECT = process.env.GCP_PROJECT || 'yash-test-495112';
process.env.ADMIN_EMAILS = 'boss@devxlabs.ai';

import { test, before, after, mock } from 'node:test';
import assert from 'node:assert/strict';

const HAVE_DB = !!process.env.DATABASE_URL;
const skip = !HAVE_DB && 'no DATABASE_URL';
const TEST_JWT_SECRET = 'test-secret-key';

mock.module('../../src/lib/secrets.js', {
  namedExports: {
    getJwtSecret: async () => TEST_JWT_SECRET,
    secretName: (p, m) => `claudex-${p}-member-${m}`,
    writeRefreshToken: async () => {}, readRefreshToken: async () => 'rt', deleteMemberSecret: async () => {},
  },
});
mock.module('firebase-admin', {
  defaultExport: {
    apps: [{}], initializeApp: () => {},
    auth: () => ({ verifyIdToken: async (t) => JSON.parse(Buffer.from(t, 'base64').toString('utf8')) }),
  },
});

const { buildServer } = await import('../../src/server.js');
const { prisma } = await import('../../src/lib/clients.js');

const fb = (email) => ({ authorization: `Bearer ${Buffer.from(JSON.stringify({ uid: email, email })).toString('base64')}` });
const ADMIN = 'boss@devxlabs.ai';
const IC = 'ic@devxlabs.ai';
const OTHER = 'other@devxlabs.ai';
const SID = 'sess_an_test';
const now = new Date().toISOString();

let app;
const cleanup = async () => {
  if (!HAVE_DB) return;
  await prisma.message.deleteMany({ where: { sessionId: SID } });
  await prisma.session.deleteMany({ where: { id: SID } });
  await prisma.syncState.deleteMany({ where: { userEmail: { in: [IC, OTHER] } } });
  await prisma.analyticsUser.deleteMany({ where: { email: { in: [IC, OTHER, ADMIN] } } });
};
before(async () => { app = await buildServer(); await app.ready(); await cleanup(); });
after(async () => { await cleanup(); if (HAVE_DB) await prisma.$disconnect(); await app.close(); });

async function enroll(email) {
  const r = await app.inject({ method: 'POST', url: '/v1/analytics/enroll', payload: { email } });
  assert.equal(r.statusCode, 200, r.body);
  return r.json().token;
}
const A = (token) => ({ authorization: `Bearer ${token}` });

const payload = {
  sessions: [{ id: SID, project: '/work/claudex', gitBranch: 'main', model: 'claude-opus-4-8' }],
  messages: [
    { uuid: 'm1', sessionId: SID, role: 'user', seq: 0, text: 'hello', ts: now },
    { uuid: 'm2', sessionId: SID, role: 'assistant', seq: 1, text: 'hi', thinking: 'ponder', model: 'claude-opus-4-8', ts: now, inputTokens: 100, outputTokens: 200, cacheReadTokens: 50 },
    { uuid: 'm3', sessionId: SID, role: 'assistant', seq: 2, text: 'more', model: 'claude-opus-4-8', ts: now, inputTokens: 10, outputTokens: 20 },
  ],
  syncState: [{ filePath: '/Users/x/.claude/projects/p/s.jsonl', byteOffset: 4096, mtime: 1234.5 }],
};

test('enroll → ingest → idempotent re-ingest', { skip }, async () => {
  const token = await enroll(IC);
  const r1 = await app.inject({ method: 'POST', url: '/v1/analytics/ingest', headers: A(token), payload });
  assert.equal(r1.statusCode, 200, r1.body);
  assert.equal(r1.json().messagesInserted, 3, 'first ingest inserts 3');

  const r2 = await app.inject({ method: 'POST', url: '/v1/analytics/ingest', headers: A(token), payload });
  assert.equal(r2.json().messagesReceived, 3);
  assert.equal(r2.json().messagesInserted, 0, 're-ingest inserts nothing (idempotent)');

  // session rollup: 110 in, 220 out, 50 cache-read, cost > 0
  const s = await prisma.session.findUnique({ where: { id: SID } });
  assert.equal(s.userEmail, IC);
  assert.equal(Number(s.inputTokens), 110);
  assert.equal(Number(s.outputTokens), 220);
  assert.equal(s.msgCount, 3);
  assert.ok(s.costUsd > 0, 'cost computed');

  // sync-state persisted for resume
  const ss = await app.inject({ method: 'GET', url: '/v1/analytics/sync-state', headers: A(token) });
  assert.equal(ss.json().syncState[0].byteOffset, 4096);
});

test('a token cannot ingest into another user’s session', { skip }, async () => {
  const evil = await enroll(OTHER);
  const r = await app.inject({ method: 'POST', url: '/v1/analytics/ingest', headers: A(evil),
    payload: { messages: [{ uuid: 'mX', sessionId: SID, role: 'user', seq: 9, text: 'steal', ts: now }] } });
  assert.equal(r.json().messagesInserted, 0, 'session owned by IC — skipped');
  const stolen = await prisma.message.findUnique({ where: { uuid: 'mX' } });
  assert.equal(stolen, null);
});

test('metrics are role-scoped', { skip }, async () => {
  // admin sees IC's session
  const a = await app.inject({ method: 'GET', url: '/v1/analytics/summary', headers: fb(ADMIN) });
  assert.equal(a.statusCode, 200);
  assert.ok(a.json().totals.sessions >= 1);

  // IC sees own
  const i = await app.inject({ method: 'GET', url: '/v1/analytics/summary', headers: fb(IC) });
  assert.ok(i.json().totals.sessions >= 1);
  assert.equal(Number(i.json().totals.inputTokens), 110);

  // OTHER (unrelated member) sees none of IC's data
  const o = await app.inject({ method: 'GET', url: '/v1/analytics/summary', headers: fb(OTHER) });
  assert.equal(o.json().totals.sessions, 0, 'member sees only their own');
});

test('breakdown is role-scoped', { skip }, async () => {
  // IC (member) sees only their own model breakdown
  const im = await app.inject({ method: 'GET', url: '/v1/analytics/breakdown?by=model', headers: fb(IC) });
  assert.equal(im.statusCode, 200);
  const opus = im.json().items.find((x) => x.key === 'claude-opus-4-8');
  assert.ok(opus, 'IC sees their opus model');
  assert.equal(Number(opus.inputTokens), 110);

  // project + hour + weekday breakdowns respond for the member
  for (const by of ['project', 'hour', 'weekday', 'tool']) {
    const r = await app.inject({ method: 'GET', url: `/v1/analytics/breakdown?by=${by}`, headers: fb(IC) });
    assert.equal(r.statusCode, 200, `${by} breakdown ok`);
    assert.ok(Array.isArray(r.json().items), `${by} returns items[]`);
  }

  // OTHER (unrelated member) sees nothing of IC's data
  const om = await app.inject({ method: 'GET', url: '/v1/analytics/breakdown?by=model', headers: fb(OTHER) });
  assert.equal(om.json().items.length, 0, 'member sees only their own breakdown');

  // extended summary exposes derived stats
  const s = await app.inject({ method: 'GET', url: '/v1/analytics/summary', headers: fb(IC) });
  const t = s.json().totals;
  assert.ok('activeUsers' in t && 'activeDays' in t && 'avgDurationMs' in t, 'summary has derived stats');
});

test('session content is admin-only', { skip }, async () => {
  const list = await app.inject({ method: 'GET', url: '/v1/analytics/sessions', headers: fb(ADMIN) });
  assert.equal(list.statusCode, 200);
  assert.ok(list.json().sessions.some((s) => s.id === SID));

  const forbidden = await app.inject({ method: 'GET', url: '/v1/analytics/sessions', headers: fb(IC) });
  assert.equal(forbidden.statusCode, 403, 'member cannot list sessions');

  const thread = await app.inject({ method: 'GET', url: `/v1/analytics/sessions/${SID}`, headers: fb(ADMIN) });
  assert.equal(thread.statusCode, 200);
  assert.equal(thread.json().messages.length, 3);
  assert.equal(thread.json().messages[0].text, 'hello');

  const denied = await app.inject({ method: 'GET', url: `/v1/analytics/sessions/${SID}`, headers: fb(IC) });
  assert.equal(denied.statusCode, 403, 'member cannot read session content');
});
