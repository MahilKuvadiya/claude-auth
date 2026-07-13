// Singleton clients shared across routes. Postgres (Prisma) is the system of record;
// Secret Manager holds per-member refresh tokens + the JWT key; Pub/Sub carries the
// best-effort usage event stream; Firebase Admin verifies dashboard ID tokens.
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';
import { PubSub } from '@google-cloud/pubsub';
import admin from 'firebase-admin';
import { config } from '../config.js';
import { prisma, serializeBigInts } from './db.js';

export { prisma, serializeBigInts };
export const sm = new SecretManagerServiceClient();
export const pubsub = new PubSub({ projectId: config.project });

if (!admin.apps.length) admin.initializeApp({ projectId: config.project });
export const firebaseAuth = admin.auth();
