// Admin-only user/role + pod management. "Manage pods / roles" is admin per the RBAC
// matrix; every route here is gated by authAdmin.
import { prisma } from '../../lib/clients.js';
import { authAdmin } from '../../plugins/auth.js';
import { ROLES, ensureUser } from '../../lib/rbac.js';

const email = { type: 'string', format: 'email' };

export default async function adminRoutes(app) {
  // ---- Users & roles ----
  app.get('/v1/admin/users', { preHandler: authAdmin }, async () => {
    const users = await prisma.analyticsUser.findMany({
      orderBy: { email: 'asc' },
      select: { email: true, role: true, name: true, orgId: true, createdAt: true },
    });
    return { users };
  });

  app.put('/v1/admin/users/:email/role', {
    preHandler: authAdmin,
    schema: { body: { type: 'object', required: ['role'], additionalProperties: false, properties: { role: { enum: ROLES } } } },
  }, async (req) => {
    const e = String(req.params.email).toLowerCase();
    await ensureUser(e);
    const user = await prisma.analyticsUser.update({
      where: { email: e }, data: { role: req.body.role },
      select: { email: true, role: true, name: true, orgId: true },
    });
    return user;
  });

  // ---- Pods ----
  app.post('/v1/admin/pods', {
    preHandler: authAdmin,
    schema: {
      body: {
        type: 'object', required: ['name', 'leadEmail'], additionalProperties: false,
        properties: { name: { type: 'string', minLength: 1, maxLength: 80 }, leadEmail: email, orgId: { type: ['string', 'null'] } },
      },
    },
  }, async (req, reply) => {
    const leadEmail = String(req.body.leadEmail).toLowerCase();
    await ensureUser(leadEmail);
    // Leading a pod implies the pod_lead role — but never downgrade an admin.
    const lead = await prisma.analyticsUser.findUnique({ where: { email: leadEmail }, select: { role: true } });
    if (lead && lead.role === 'member')
      await prisma.analyticsUser.update({ where: { email: leadEmail }, data: { role: 'pod_lead' } });
    const pod = await prisma.pod.create({
      data: { name: req.body.name, leadEmail, orgId: req.body.orgId || null },
      select: { id: true, name: true, leadEmail: true, orgId: true, createdAt: true },
    });
    reply.code(201);
    return pod;
  });

  app.get('/v1/admin/pods', { preHandler: authAdmin }, async () => {
    const pods = await prisma.pod.findMany({
      orderBy: { createdAt: 'asc' },
      include: { members: { select: { userEmail: true } } },
    });
    return {
      pods: pods.map((p) => ({
        id: p.id, name: p.name, leadEmail: p.leadEmail, orgId: p.orgId,
        members: p.members.map((m) => m.userEmail),
      })),
    };
  });

  app.post('/v1/admin/pods/:id/members', {
    preHandler: authAdmin,
    schema: { body: { type: 'object', required: ['email'], additionalProperties: false, properties: { email } } },
  }, async (req, reply) => {
    const podId = req.params.id;
    const pod = await prisma.pod.findUnique({ where: { id: podId } });
    if (!pod) throw Object.assign(new Error('pod not found'), { statusCode: 404, code: 'not_found' });
    const userEmail = String(req.body.email).toLowerCase();
    await ensureUser(userEmail);
    await prisma.podMembership.upsert({
      where: { podId_userEmail: { podId, userEmail } },
      create: { podId, userEmail }, update: {},
    });
    reply.code(201);
    return { podId, userEmail };
  });

  app.delete('/v1/admin/pods/:id/members/:email', { preHandler: authAdmin }, async (req) => {
    const podId = req.params.id;
    const userEmail = String(req.params.email).toLowerCase();
    await prisma.podMembership.deleteMany({ where: { podId, userEmail } });
    return { podId, userEmail, removed: true };
  });
}
