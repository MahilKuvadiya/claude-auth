import { authAnalytics } from '../../plugins/auth.js';
import { signAnalyticsToken } from '../../lib/jwt.js';
import { ensureUser } from '../../lib/rbac.js';
import { config } from '../../config.js';

// POST /v1/analytics/enroll — auto-enrollment for the collector. The shared enroll key
// (embedded by the installer) proves org membership; email domain is allowlisted. Returns
// a long-lived analytics token scoped to THIS email — it can only ever ingest its own data.
export default async function enrollRoute(app) {
  app.post('/v1/analytics/enroll', {
    schema: {
      body: {
        type: 'object', required: ['email'], additionalProperties: true,
        properties: { email: { type: 'string', format: 'email' }, name: { type: ['string', 'null'] } },
      },
    },
  }, async (req) => {
    if (config.enrollKey) {
      const key = (req.headers['x-enroll-key'] || '').toString();
      if (key !== config.enrollKey) throw Object.assign(new Error('enrollment not permitted'), { statusCode: 403, code: 'forbidden' });
    }
    const email = String(req.body.email).toLowerCase();
    const domain = email.split('@')[1] || '';
    if (config.enrollDomains.length && !config.enrollDomains.includes(domain))
      throw Object.assign(new Error('email domain not allowed'), { statusCode: 403, code: 'forbidden' });

    await ensureUser(email, { name: req.body.name || null });
    const token = await signAnalyticsToken({ email });
    return { email, token };
  });

  // GET /v1/analytics/whoami — token introspection (collector self-check).
  app.get('/v1/analytics/whoami', { preHandler: authAnalytics }, async (req) => ({ email: req.subject }));
}
