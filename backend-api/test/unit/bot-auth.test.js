// Bot service-auth gating (no GCP/DB): rejects before any role/DB lookup.
process.env.NODE_ENV = 'test';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

const { buildServer } = await import('../../src/server.js');
let app;
before(async () => { app = await buildServer(); await app.ready(); });
after(async () => { await app.close(); });

test('x-bot-token with wrong secret → 401', async () => {
  const r = await app.inject({
    method: 'GET', url: '/v1/me',
    headers: { 'x-bot-token': 'nope', 'x-acting-email': 'a@b.com' },
  });
  assert.equal(r.statusCode, 401);
  assert.equal(r.json().error.code, 'unauthenticated');
});

test('/v1/me/pools without any auth → 401', async () => {
  const r = await app.inject({ method: 'GET', url: '/v1/me/pools' });
  assert.equal(r.statusCode, 401);
  assert.equal(r.json().error.code, 'unauthenticated');
});
