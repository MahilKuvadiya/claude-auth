#!/usr/bin/env node
/**
 * OPERATOR-ONLY provisioning script. NOT part of the distributed `claudex` binary
 * and never handed to users — you run it to mint orgs + org-admin dashboard logins.
 *
 * Auth: uses Application Default Credentials. Run once:
 *     gcloud auth application-default login
 *
 * Usage (from backend/, where firebase-admin is installed):
 *     node provision-admin.mjs org-create   --id devx --name "devx labs" --domain devxlabs.ai
 *     node provision-admin.mjs admin-create  --org devx --email admin@devxlabs.ai
 *     node provision-admin.mjs admin-list    --org devx
 *     node provision-admin.mjs admin-revoke  --email admin@devxlabs.ai
 *
 * `admin-create` creates the Firebase Auth user (no password set by us), grants the
 * org_admin claim, and prints a ONE-TIME set-password link — the admin clicks it,
 * sets their own password, then signs in to the dashboard. We never see a password.
 */
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const PROJECT = process.env.GCP_PROJECT || 'yash-test-495112';
const DB = process.env.FIRESTORE_DB || 'claude-pool';

const app = initializeApp({ projectId: PROJECT });
const auth = getAuth(app);
const db = getFirestore(app, DB);

// --- tiny arg parser ---
const [cmd, ...rest] = process.argv.slice(2);
const args = {};
for (let i = 0; i < rest.length; i += 2) args[rest[i].replace(/^--/, '')] = rest[i + 1];
const need = (k) => { if (!args[k]) die(`--${k} is required`); return args[k]; };
function die(m) { console.error('✗ ' + m); process.exit(1); }

async function orgCreate() {
  const id = need('id'), name = need('name');
  await db.collection('orgs').doc(id).set(
    { name, domain: args.domain || null, admins: [], createdAt: FieldValue.serverTimestamp() },
    { merge: true },
  );
  console.log(`✓ org '${id}' (${name}) created`);
}

async function adminCreate() {
  const orgId = need('org'), email = need('email').toLowerCase();
  const org = await db.collection('orgs').doc(orgId).get();
  if (!org.exists) die(`org '${orgId}' doesn't exist — run org-create first`);

  let user;
  try { user = await auth.getUserByEmail(email); }
  catch { user = await auth.createUser({ email, emailVerified: false }); }

  await auth.setCustomUserClaims(user.uid, { role: 'org_admin', orgId });
  await db.collection('orgs').doc(orgId).set({ admins: FieldValue.arrayUnion(email) }, { merge: true });

  const link = await auth.generatePasswordResetLink(email);
  console.log(`✓ admin '${email}' provisioned for org '${orgId}'`);
  console.log('\n  Send them this one-time set-password link:\n');
  console.log('  ' + link + '\n');
  console.log('  They set a password, then sign in at the dashboard.');
}

async function adminList() {
  const orgId = need('org');
  const org = await db.collection('orgs').doc(orgId).get();
  if (!org.exists) die(`org '${orgId}' doesn't exist`);
  const admins = org.data().admins || [];
  console.log(`admins for '${orgId}':`);
  admins.forEach((e) => console.log('  · ' + e));
  if (!admins.length) console.log('  (none)');
}

async function adminRevoke() {
  const email = need('email').toLowerCase();
  const user = await auth.getUserByEmail(email);
  await auth.setCustomUserClaims(user.uid, { role: null, orgId: null });
  await auth.revokeRefreshTokens(user.uid); // force existing sessions out
  const claims = (await auth.getUser(user.uid)).customClaims || {};
  if (claims.orgId) await db.collection('orgs').doc(claims.orgId).set(
    { admins: FieldValue.arrayRemove(email) }, { merge: true });
  console.log(`✓ '${email}' admin access revoked (sessions invalidated)`);
}

const table = { 'org-create': orgCreate, 'admin-create': adminCreate, 'admin-list': adminList, 'admin-revoke': adminRevoke };
(table[cmd] || (() => die(`unknown command '${cmd || ''}'. one of: ${Object.keys(table).join(', ')}`)))()
  .then(() => process.exit(0))
  .catch((e) => die(e.message));
