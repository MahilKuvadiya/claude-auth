// Compose the shape the App Home view needs: pools + members merged with live
// usage headroom. One place so listeners stay thin.

import { backend } from "./backend.js";

/** Load the caller's pools, each with members + live rate-limit headroom. */
export async function loadPoolsFor(identity) {
  const { pools = [] } = (await backend.listPools(identity.email)) || {};
  const out = [];
  for (const p of pools) {
    let members = [];
    try {
      const [mres, ures] = await Promise.all([
        backend.listMembers(p.id, identity.email),
        backend.usage(p.id, identity.email).catch(() => ({ members: [] })),
      ]);
      const usageById = Object.fromEntries(
        (ures?.members || []).map((u) => [u.id, u]),
      );
      members = (mres?.members || []).map((m) => ({
        ...m,
        rateLimit: usageById[m.id]?.rateLimit || m.rateLimit || null,
      }));
    } catch {
      /* leave members empty; the view degrades gracefully */
    }
    out.push({ ...p, members });
  }
  return out;
}
