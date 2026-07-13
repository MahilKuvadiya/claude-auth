// Org scoping for control-plane (pool) routes.
export function assertPoolInOrg(actor, pool) {
  // admin is global; pod_lead is confined to their own org.
  if (actor.role === 'pod_lead' && pool.orgId && actor.orgId && pool.orgId !== actor.orgId)
    throw Object.assign(new Error('pool belongs to another org'), { statusCode: 403, code: 'forbidden' });
}
