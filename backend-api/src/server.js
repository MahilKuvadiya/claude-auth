import { randomUUID } from 'node:crypto';
import Fastify from 'fastify';
import helmet from '@fastify/helmet';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { config } from './config.js';
import { installErrorHandlers } from './plugins/errors.js';

import healthRoutes from './routes/health.js';
import openapiRoutes from './routes/openapi.js';
import poolsRoutes from './routes/control/pools.js';
import membersRoutes from './routes/control/members.js';
import rollupsRoutes from './routes/control/rollups.js';
import joinLinksRoutes from './routes/control/joinLinks.js';
import joinRoute from './routes/data/join.js';
import tokenRoute from './routes/data/token.js';
import telemetryRoute from './routes/data/telemetry.js';
import pollUsageRoute from './routes/internal/pollUsage.js';

// Map Pino numeric levels → Cloud Logging severity so logs render correctly in GCP.
const SEVERITY = { 10: 'DEBUG', 20: 'DEBUG', 30: 'INFO', 40: 'WARNING', 50: 'ERROR', 60: 'CRITICAL' };

export async function buildServer(opts = {}) {
  const app = Fastify({
    trustProxy: true,
    // request id from Cloud Trace header when present, else Fastify's own
    genReqId(req) {
      const t = req.headers['x-cloud-trace-context'];
      if (typeof t === 'string' && t.includes('/')) return t.split('/')[0];
      return randomUUID();
    },
    logger: config.nodeEnv === 'test' ? false : {
      level: config.logLevel,
      messageKey: 'message',
      formatters: { level: (label, n) => ({ severity: SEVERITY[n] || 'DEFAULT' }) },
      // never log auth headers / tokens
      redact: { paths: ['req.headers.authorization', 'req.headers.cookie'], remove: true },
    },
    ...opts,
  });

  await app.register(helmet, { contentSecurityPolicy: false }); // API + Scalar docs
  await app.register(cors, {
    origin: config.dashboardOrigins.includes('*') ? true : config.dashboardOrigins,
    methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type'],
  });
  await app.register(rateLimit, { global: true, max: 600, timeWindow: '1 minute' });

  installErrorHandlers(app);

  // routes
  await app.register(healthRoutes);
  await app.register(openapiRoutes);
  await app.register(poolsRoutes);
  await app.register(membersRoutes);
  await app.register(rollupsRoutes);
  await app.register(joinLinksRoutes);
  await app.register(joinRoute);
  await app.register(tokenRoute);
  await app.register(telemetryRoute);
  await app.register(pollUsageRoute);

  return app;
}
