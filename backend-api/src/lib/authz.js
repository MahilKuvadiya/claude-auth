// Org scoping for control-plane routes.
export function assertPoolInOrg(actor, pool) {
  // org_admin is bound to a single org; pod_lead is allowed across (matches firestore.rules intent).
  if (actor.role === 'org_admin' && pool.orgId && actor.orgId && pool.orgId !== actor.orgId)
    throw Object.assign(new Error('pool belongs to another org'), { statusCode: 403, code: 'forbidden' });
}
