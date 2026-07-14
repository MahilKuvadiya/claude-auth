// The App Home data source. The backend does the scoping + merging in one call
// (GET /v1/me/pools returns the caller's pools with member rosters + cached
// headroom), so this stays a thin pass-through.

import { backend } from "./backend.js";

/** Load the caller's pools, each with its member roster + rate-limit headroom. */
export async function loadPoolsFor(identity) {
  const { pools = [] } = (await backend.mePools(identity.email)) || {};
  return pools;
}
