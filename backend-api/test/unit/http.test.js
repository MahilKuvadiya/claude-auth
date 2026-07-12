// Unit tests that never touch GCP: wiring, auth gating, error envelopes, validation, CORS.
process.env.NODE_ENV = 'test';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

const { buildServer } = await import('../../src/server.js');
let app;
before(async () => { app = await buildServer(); await app.ready(); });
after(async () => { await app.close(); });

test('GET /v1/health → 200', async () => {
  const r = await app.inject({ method: 'GET', url: '/v1/health' });
  assert.equal(r.statusCode, 200);
  assert.equal(r.json().ok, true);
});

test('protected control-plane route without token → 401 + envelope', async () => {
  const r = await app.inject({ method: 'GET', url: '/v1/pools' });
  assert.equal(r.statusCode, 401);
  const b = r.json();
  assert.equal(b.error.code, 'unauthenticated');
  assert.ok(b.error.requestId, 'requestId present');
});

test('data-plane token route without member JWT → 401', async () => {
  const r = await app.inject({ method: 'GET', url: '/v1/pools/pl_x/token' });
  assert.equal(r.statusCode, 401);
});

test('telemetry without member JWT → 401', async () => {
  const r = await app.inject({ method: 'POST', url: '/v1/telemetry', payload: { events: [] } });
  assert.equal(r.statusCode, 401);
});

test('join with missing body → 400 invalid_request', async () => {
  const r = await app.inject({ method: 'POST', url: '/v1/pools/join', payload: {} });
  assert.equal(r.statusCode, 400);
  assert.equal(r.json().error.code, 'invalid_request');
});

test('unknown route → 404 not_found envelope', async () => {
  const r = await app.inject({ method: 'GET', url: '/v1/nope' });
  assert.equal(r.statusCode, 404);
  assert.equal(r.json().error.code, 'not_found');
});

test('internal poll-usage without shared token → 403', async () => {
  const r = await app.inject({ method: 'POST', url: '/v1/internal/poll-usage', payload: {} });
  assert.equal(r.statusCode, 403);
});

test('CORS preflight is answered', async () => {
  const r = await app.inject({
    method: 'OPTIONS', url: '/v1/pools',
    headers: { origin: 'https://example.com', 'access-control-request-method': 'GET' },
  });
  assert.ok(r.statusCode === 204 || r.statusCode === 200);
  assert.ok(r.headers['access-control-allow-methods']);
});
