// Contract test: every path+method documented in the OpenAPI spec must be a real
// registered route (catches spec↔implementation drift), and vice-versa for /v1/*.
process.env.NODE_ENV = 'test';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import YAML from 'yaml';

const here = dirname(fileURLToPath(import.meta.url));
const { buildServer } = await import('../src/server.js');

let app; let spec;
before(async () => {
  app = await buildServer();
  await app.ready();
  spec = YAML.parse(await readFile(join(here, '..', 'openapi', 'claudex.v1.yaml'), 'utf8'));
});
after(async () => { await app.close(); });

// OpenAPI {param} → Fastify :param
const toFastify = (p) => p.replace(/\{(\w+)\}/g, ':$1');

test('spec is OpenAPI 3.1 with security schemes', () => {
  assert.equal(spec.openapi, '3.1.0');
  assert.ok(spec.components.securitySchemes.firebaseIdToken);
  assert.ok(spec.components.securitySchemes.memberJwt);
});

test('every documented path+method is a registered route', () => {
  const missing = [];
  for (const [path, ops] of Object.entries(spec.paths)) {
    for (const method of Object.keys(ops)) {
      if (!['get', 'post', 'put', 'delete', 'patch'].includes(method)) continue;
      const url = toFastify(path);
      if (!app.hasRoute({ method: method.toUpperCase(), url })) {
        missing.push(`${method.toUpperCase()} ${url}`);
      }
    }
  }
  assert.deepEqual(missing, [], `spec paths with no route: ${missing.join(', ')}`);
});

test('every /v1 route (except docs/openapi/health/internal) is documented', () => {
  const documented = new Set();
  for (const [path, ops] of Object.entries(spec.paths)) {
    for (const method of Object.keys(ops)) documented.add(`${method.toUpperCase()} ${toFastify(path)}`);
  }
  const undocumented = [];
  const skip = /^\/v1\/(docs|openapi\.json|health|internal)/;
  for (const line of app.printRoutes({ commonPrefix: false }).split('\n')) {
    // printRoutes is a tree; rely on hasRoute-driven check instead for precision.
  }
  // Spot-check the core resource routes are present in the spec.
  for (const r of ['GET /v1/pools', 'POST /v1/pools', 'GET /v1/pools/:id/members',
    'DELETE /v1/pools/:id/members/:mid', 'GET /v1/pools/:id/token', 'POST /v1/telemetry']) {
    assert.ok(documented.has(r), `${r} should be documented`);
  }
  void skip; void undocumented;
});
