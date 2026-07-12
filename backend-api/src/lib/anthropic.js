// Anthropic OAuth refresh + rate-limit usage. The refresh token is single-use and
// rotates — callers MUST persist the returned refresh_token.
import { config } from '../config.js';

export async function refreshAccessToken(refreshToken) {
  const r = await fetch(config.oauthTokenUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: config.oauthClientId,
    }),
  });
  if (!r.ok) throw new Error(`oauth refresh failed: ${r.status}`);
  return r.json(); // { access_token, refresh_token, expires_in }
}

export async function anthropicUsage(token) {
  try {
    const r = await fetch(config.anthropicUsageUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
        'anthropic-beta': 'oauth-2025-04-20',
        'anthropic-version': '2023-06-01',
      },
    });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}
