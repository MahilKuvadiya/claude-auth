// Singleton GCP clients shared across routes.
import { Firestore } from '@google-cloud/firestore';
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';
import { PubSub } from '@google-cloud/pubsub';
import admin from 'firebase-admin';
import { config } from '../config.js';

export const db = new Firestore({ projectId: config.project, databaseId: config.database });
export const sm = new SecretManagerServiceClient();
export const pubsub = new PubSub({ projectId: config.project });

if (!admin.apps.length) admin.initializeApp({ projectId: config.project });
export const firebaseAuth = admin.auth();
