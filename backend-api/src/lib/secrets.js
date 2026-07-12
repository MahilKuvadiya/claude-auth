// Secret Manager custody of per-member refresh tokens + the member-JWT signing key.
// Refresh tokens live ONLY here and never enter a response body.
import { sm } from './clients.js';
import { config } from '../config.js';

let _jwtSecretCache = null;
export async function getJwtSecret() {
  if (_jwtSecretCache) return _jwtSecretCache;
  const [v] = await sm.accessSecretVersion({ name: config.jwtSecretName });
  _jwtSecretCache = v.payload.data.toString('utf8');
  return _jwtSecretCache;
}

export function secretName(poolId, memberId) {
  return `claudex-${poolId}-member-${memberId}`;
}

export async function writeRefreshToken(poolId, memberId, refreshToken) {
  const parent = `projects/${config.project}`;
  const secretId = secretName(poolId, memberId);
  try {
    // Pilot: Google-managed encryption at rest. CMEK hardening (userManaged replica +
    // kmsKeyName) switches on once the SM service agent has cryptoKeyEncrypterDecrypter.
    await sm.createSecret({ parent, secretId, secret: { replication: { automatic: {} } } });
  } catch (e) { if (e.code !== 6 /* ALREADY_EXISTS */) throw e; }
  await sm.addSecretVersion({
    parent: `${parent}/secrets/${secretId}`,
    payload: { data: Buffer.from(refreshToken, 'utf8') },
  });
}

export async function readRefreshToken(poolId, memberId) {
  const [v] = await sm.accessSecretVersion({
    name: `projects/${config.project}/secrets/${secretName(poolId, memberId)}/versions/latest`,
  });
  return v.payload.data.toString('utf8');
}

export async function deleteMemberSecret(poolId, memberId) {
  try {
    await sm.deleteSecret({ name: `projects/${config.project}/secrets/${secretName(poolId, memberId)}` });
  } catch (e) { if (e.code !== 5 /* NOT_FOUND */) throw e; }
}
