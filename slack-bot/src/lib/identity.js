// Slack user → claudex identity (email + role). Role-gating lives here.
// See research/slack-bot/PLAN.md §3.

import { backend } from "./backend.js";

/**
 * Resolve a Slack user to their claudex identity.
 * @returns {{slackUserId, email, role, orgId}} role ∈ "org_admin" | "member" | "none"
 */
export async function resolveIdentity(client, slackUserId) {
  let email = null;
  try {
    const info = await client.users.info({ user: slackUserId });
    email = info?.user?.profile?.email || null;
  } catch {
    /* users:read.email may be missing, or a bot/deactivated user */
  }
  if (!email) return { slackUserId, email: null, role: "none", orgId: null };

  try {
    const who = await backend.whoami(email); // { role, orgId } (backend TODO)
    return {
      slackUserId,
      email,
      role: who?.role || "member",
      orgId: who?.orgId || null,
    };
  } catch {
    // Unknown to claudex (or backend whoami not yet deployed).
    return { slackUserId, email, role: "none", orgId: null };
  }
}

export function isAdmin(identity) {
  return identity?.role === "org_admin" || identity?.role === "pod_lead";
}

/** Throw a user-facing error if the identity may not perform admin actions. */
export function requireAdmin(identity) {
  if (!isAdmin(identity)) {
    const err = new Error("This action is limited to claudex pool admins.");
    err.userFacing = true;
    throw err;
  }
}
