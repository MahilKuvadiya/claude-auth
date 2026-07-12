// Central config, validated at boot. Everything env-overridable; defaults match
// the provisioned project so local `npm start` works without a full env file.

function req(name, fallback) {
  const v = process.env[name] ?? fallback;
  if (v === undefined || v === '') throw new Error(`missing required env ${name}`);
  return v;
}

export const config = {
  project: req('GCP_PROJECT', 'yash-test-495112'),
  database: req('FIRESTORE_DB', 'claude-pool'),
  location: req('KMS_LOCATION', 'asia-south1'),
  kmsKey: process.env.KMS_KEY
    || `projects/${req('GCP_PROJECT', 'yash-test-495112')}/locations/${req('KMS_LOCATION', 'asia-south1')}/keyRings/claude-pool/cryptoKeys/refresh-tokens`,
  usageTopic: req('USAGE_TOPIC', 'claude-pool-usage'),
  jwtSecretName: process.env.JWT_SECRET
    || `projects/${req('GCP_PROJECT', 'yash-test-495112')}/secrets/claudex-member-jwt/versions/latest`,

  // Anthropic OAuth (public client id — not a secret)
  oauthTokenUrl: process.env.OAUTH_TOKEN_URL || 'https://platform.claude.com/v1/oauth/token',
  oauthClientId: process.env.OAUTH_CLIENT_ID || '9d1c250a-e61b-44d9-88ed-5944d1962f5e',
  anthropicUsageUrl: process.env.ANTHROPIC_USAGE_URL || 'https://api.anthropic.com/api/oauth/usage',
  accessSkewMs: Number(process.env.ACCESS_SKEW_MS || 60_000),

  // HTTP
  port: Number(process.env.PORT || 8080),
  host: process.env.HOST || '0.0.0.0',
  // CORS allowlist for the dashboard SPA (comma-separated origins, or '*')
  dashboardOrigins: (process.env.DASHBOARD_ORIGIN || '*').split(',').map((s) => s.trim()),
  // Shared secret the internal poll-usage route requires (Cloud Scheduler → OIDC in prod)
  internalToken: process.env.INTERNAL_TOKEN || '',
  logLevel: process.env.LOG_LEVEL || 'info',
  nodeEnv: process.env.NODE_ENV || 'production',
};

export const JOIN_TTL_DAYS = 14;
