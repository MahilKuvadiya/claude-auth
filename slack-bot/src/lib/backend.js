// Thin client for claudex backend-api (/v1). The bot authenticates with a service
// credential (x-bot-token) and passes the acting Slack user's email (x-acting-email);
// the backend resolves that email's role SERVER-SIDE. See research/slack-bot/PLAN.md §3.

import { config } from "../config.js";

async function api(path, { method = "GET", body, actingEmail } = {}) {
  const headers = { "content-type": "application/json" };
  if (config.botToken) headers["x-bot-token"] = config.botToken;
  if (actingEmail) headers["x-acting-email"] = actingEmail;

  const res = await fetch(`${config.apiUrl}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
  if (!res.ok) {
    const err = new Error(data?.error?.message || `HTTP ${res.status}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export const backend = {
  // identity + role for the acting user (server-resolved)
  me: (actingEmail) => api("/v1/me", { actingEmail }),
  // the acting user's pools with member rosters + cached headroom (role-scoped)
  mePools: (actingEmail) => api("/v1/me/pools", { actingEmail }),
  // admin control-plane (backend requires admin/pod_lead for the acting email)
  createJoinLink: (poolId, targetEmail, actingEmail) =>
    api(`/v1/pools/${poolId}/join-links`, { method: "POST", body: { email: targetEmail }, actingEmail }),
  revokeMember: (poolId, memberId, actingEmail) =>
    api(`/v1/pools/${poolId}/members/${encodeURIComponent(memberId)}`, { method: "DELETE", actingEmail }),
  createPool: (name, mode, actingEmail) =>
    api("/v1/pools", { method: "POST", body: { name, mode }, actingEmail }),
};
