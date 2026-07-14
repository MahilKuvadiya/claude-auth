// Central config, validated at boot. Everything env-overridable; defaults match
// the provisioned project so local `npm start` works without a full env file.

function req(name, fallback) {
  const v = process.env[name] ?? fallback;
  if (v === undefined || v === '') throw new Error(`missing required env ${name}`);
  return v;
}

export const config = {
  project: req('GCP_PROJECT', 'yash-test-495112'),
  location: req('KMS_LOCATION', 'asia-south1'),
  usageTopic: req('USAGE_TOPIC', 'claude-pool-usage'),
  // Member/analytics JWT signing key. Cloud Run injects JWT_SECRET pointing at
  // claudex-jwt-<env>; the fallback is for local dev only.
  jwtSecretName: process.env.JWT_SECRET
    || `projects/${req('GCP_PROJECT', 'yash-test-495112')}/secrets/claudex-jwt-uat/versions/latest`,

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
  // Bootstrap admins: these emails are always role=admin regardless of the AnalyticsUser
  // row (solves the chicken-and-egg — someone must be able to grant roles first).
  adminEmails: (process.env.ADMIN_EMAILS || 'vishal.makwana@devxlabs.ai')
    .split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
  // Analytics auto-enrollment: the collector proves org membership with this shared key
  // (embedded by the installer). Optional email-domain allowlist restricts who may enroll.
  enrollKey: process.env.ENROLL_KEY || '',
  enrollDomains: (process.env.ENROLL_DOMAINS || 'devxlabs.ai')
    .split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
  // Dashboard sign-in: Google OAuth 2.0 Web Client id. The dashboard obtains a Google
  // ID token (GIS) and we verify it here (aud=this client). Same domain allowlist as enroll.
  googleClientId: process.env.GOOGLE_CLIENT_ID || '',
  // Shared secret the internal poll-usage route requires (Cloud Scheduler → OIDC in prod)
  internalToken: process.env.INTERNAL_TOKEN || '',
  logLevel: process.env.LOG_LEVEL || 'info',
  nodeEnv: process.env.NODE_ENV || 'production',
};

export const JOIN_TTL_DAYS = 14;
