import { authUser } from '../plugins/auth.js';

// GET /v1/me — the caller's server-resolved identity + role. The dashboard uses this
// (not the Firebase claim) to decide which views to show; the server enforces regardless.
export default async function meRoutes(app) {
  app.get('/v1/me', { preHandler: authUser }, async (req) => ({
    email: req.actor.email,
    role: req.actor.role,
    orgId: req.actor.orgId,
  }));
}
