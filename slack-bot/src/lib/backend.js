// Thin client for claudex backend-api (/v1). The bot authenticates with a
// service credential (x-bot-token) and passes the acting Slack user's email so
// the backend can attribute/authorize the action. See research/slack-bot/PLAN.md §3.
//
// NOTE: the `x-bot-token` auth path and `GET /v1/whoami` are backend changes
// still to land (PLAN §3 "backend changes needed"); until then these calls 401.

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
  whoami: (email) => api(`/v1/whoami?email=${encodeURIComponent(email)}`),
  listPools: (actingEmail) => api("/v1/pools", { actingEmail }),
  getPool: (id, actingEmail) => api(`/v1/pools/${id}`, { actingEmail }),
  listMembers: (id, actingEmail) => api(`/v1/pools/${id}/members`, { actingEmail }),
  usage: (id, actingEmail) => api(`/v1/pools/${id}/usage`, { actingEmail }),
  createJoinLink: (id, targetEmail, actingEmail) =>
    api(`/v1/pools/${id}/join-links`, { method: "POST", body: { targetEmail }, actingEmail }),
  revokeMember: (id, memberId, actingEmail) =>
    api(`/v1/pools/${id}/members/${memberId}`, { method: "DELETE", actingEmail }),
  createPool: (name, mode, actingEmail) =>
    api("/v1/pools", { method: "POST", body: { name, mode }, actingEmail }),
};
