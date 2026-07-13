// One-time Firestore → Postgres data move for the pool control-plane. Idempotent
// (upserts by primary key), so it can be run repeatedly and re-run right before cutover
// to catch last-minute writes. Refresh tokens are NOT touched — they live in Secret
// Manager and stay there; only pool/member/joinLink/rollup metadata is copied.
//
// Prereqs:
//   npm i @google-cloud/firestore            # temporary; not a runtime dep
//   export DATABASE_URL=<prod Postgres URL>  # via Cloud SQL proxy → claudex_prod
//   export GCP_PROJECT=yash-test-495112 FIRESTORE_DB=claude-pool
// Run:
//   node scripts/migrate-firestore.mjs [--dry]
import { Firestore } from '@google-cloud/firestore';
import { PrismaClient } from '@prisma/client';

const DRY = process.argv.includes('--dry');
const fs = new Firestore({ projectId: process.env.GCP_PROJECT, databaseId: process.env.FIRESTORE_DB || 'claude-pool' });
const prisma = new PrismaClient();

const ts = (v) => (v && typeof v.toMillis === 'function' ? new Date(v.toMillis()) : v ? new Date(v) : null);
const big = (n) => BigInt(Math.max(0, Math.trunc(Number(n) || 0)));

let counts = { pools: 0, members: 0, joinLinks: 0, rollups: 0 };

async function run() {
  // Pools + their member/rollup subcollections
  const pools = await fs.collection('pools').get();
  for (const p of pools.docs) {
    const d = p.data();
    if (!DRY) {
      await prisma.pool.upsert({
        where: { id: p.id },
        create: { id: p.id, orgId: d.orgId || null, name: d.name || p.id, mode: d.mode || 'failover', status: d.status || 'active', createdBy: d.createdBy || null, createdAt: ts(d.createdAt) || undefined },
        update: { orgId: d.orgId || null, name: d.name || p.id, mode: d.mode || 'failover', status: d.status || 'active' },
      });
    }
    counts.pools++;

    const members = await p.ref.collection('members').get();
    for (const m of members.docs) {
      const md = m.data();
      if (!DRY) {
        await prisma.member.upsert({
          where: { poolId_memberId: { poolId: p.id, memberId: m.id } },
          create: {
            poolId: p.id, memberId: m.id, email: md.email || null, accountUuid: md.accountUuid || null,
            poolRole: md.role || md.poolRole || 'member', status: md.status || 'active', secretRef: md.secretRef || null,
            accessToken: md.accessToken || null, accessExpiresAt: ts(md.accessExpiresAt), subscriptionType: md.subscriptionType || null,
            rateLimit: md.rateLimit || undefined, joinedAt: ts(md.joinedAt) || undefined,
            revokedAt: ts(md.revokedAt), revokedBy: md.revokedBy || null,
          },
          update: {
            email: md.email || null, accountUuid: md.accountUuid || null, poolRole: md.role || md.poolRole || 'member',
            status: md.status || 'active', secretRef: md.secretRef || null, subscriptionType: md.subscriptionType || null,
            rateLimit: md.rateLimit || undefined, revokedAt: ts(md.revokedAt), revokedBy: md.revokedBy || null,
          },
        });
      }
      counts.members++;
    }

    const rollups = await p.ref.collection('rollups').get();
    for (const r of rollups.docs) {
      const rd = r.data();
      if (!DRY) {
        await prisma.rollup.upsert({
          where: { poolId_period: { poolId: p.id, period: r.id } },
          create: { poolId: p.id, period: r.id, tokensIn: big(rd.tokensIn), tokensOut: big(rd.tokensOut), cacheRead: big(rd.cacheRead), cacheWrite: big(rd.cacheWrite), requests: big(rd.requests), byMember: rd.byMember || undefined },
          update: { tokensIn: big(rd.tokensIn), tokensOut: big(rd.tokensOut), cacheRead: big(rd.cacheRead), cacheWrite: big(rd.cacheWrite), requests: big(rd.requests), byMember: rd.byMember || undefined },
        });
      }
      counts.rollups++;
    }
  }

  // Top-level joinLinks
  const links = await fs.collection('joinLinks').get();
  for (const l of links.docs) {
    const d = l.data();
    if (!DRY) {
      await prisma.joinLink.upsert({
        where: { token: l.id },
        create: { token: l.id, poolId: d.poolId, targetEmail: d.targetEmail, role: d.role || 'member', createdBy: d.createdBy || null, createdAt: ts(d.createdAt) || undefined, expiresAt: ts(d.expiresAt), usedAt: ts(d.usedAt), memberId: d.memberId || null },
        update: { targetEmail: d.targetEmail, role: d.role || 'member', usedAt: ts(d.usedAt), memberId: d.memberId || null },
      });
    }
    counts.joinLinks++;
  }

  console.log(DRY ? '[dry-run] would migrate:' : 'migrated:', counts);
  await prisma.$disconnect();
}

run().catch((e) => { console.error(e); process.exit(1); });
