// Singleton clients shared across routes. Postgres (Prisma) is the system of record;
// Secret Manager holds per-member refresh tokens + the JWT key; Pub/Sub carries the
// best-effort usage event stream; Google OAuth verifies dashboard sign-in ID tokens.
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';
import { PubSub } from '@google-cloud/pubsub';
import { OAuth2Client } from 'google-auth-library';
import { config } from '../config.js';
import { prisma, serializeBigInts } from './db.js';

export { prisma, serializeBigInts };
export const sm = new SecretManagerServiceClient();
export const pubsub = new PubSub({ projectId: config.project });

// Verifies Google ID tokens (GIS) issued for our OAuth Web Client.
export const googleOAuth = new OAuth2Client(config.googleClientId);
