import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import YAML from 'yaml';
import scalar from '@scalar/fastify-api-reference';

const here = dirname(fileURLToPath(import.meta.url));
const SPEC_PATH = join(here, '..', '..', 'openapi', 'claudex.v1.yaml');

export default async function openapiRoutes(app) {
  let spec = null;
  try { spec = YAML.parse(await readFile(SPEC_PATH, 'utf8')); }
  catch (e) { app.log.warn({ err: e }, 'openapi spec not found — /v1/docs will 503'); }

  app.get('/v1/openapi.json', async (req, reply) => {
    if (!spec) return reply.code(503).send({ error: { code: 'spec_unavailable', message: 'spec not built', requestId: req.id } });
    return spec;
  });

  if (spec) {
    await app.register(scalar, {
      routePrefix: '/v1/docs',
      configuration: { title: 'claudex API', url: '/v1/openapi.json' },
    });
  }
}
