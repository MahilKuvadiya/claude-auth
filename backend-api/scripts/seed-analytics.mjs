// Seed multi-role analytics test data so every dashboard view (member / pod_lead / admin)
// has realistic data. Idempotent: seed users/sessions/messages are keyed by fixed ids and
// fully recreated each run. Intended for UAT (never run against prod).
//
//   DATABASE_URL=<uat via Cloud SQL proxy> node scripts/seed-analytics.mjs
import { PrismaClient } from '@prisma/client';
import { costFor } from '../src/lib/pricing.js';

const prisma = new PrismaClient();

const USERS = [
  { email: 'admin@devxlabs.ai', role: 'admin', name: 'Ada Admin' },
  { email: 'lead@devxlabs.ai', role: 'pod_lead', name: 'Leo Lead' },
  { email: 'ic1@devxlabs.ai', role: 'member', name: 'Ivy One' },
  { email: 'ic2@devxlabs.ai', role: 'member', name: 'Ian Two' },
];
const POD_ID = 'seed-pod-alpha';
const POD_MEMBERS = ['ic1@devxlabs.ai', 'ic2@devxlabs.ai']; // led by lead@
const MODELS = ['claude-opus-4-8', 'claude-sonnet-5', 'claude-haiku-4-5-20251001'];
const PROJECTS = ['/work/ai-chatbot', '/work/claudex', '/work/agent-repo', '/work/finetune-jewl', '/work/netflix-eval'];
const BRANCHES = ['main', 'develop', 'feat/analytics', 'fix/bug-123'];
const TOOLS = ['Bash', 'Edit', 'Read', 'Write', 'Grep', 'Glob', 'WebFetch', 'Task'];

// Deterministic PRNG so re-runs produce identical data.
let _s = 987654321;
const rnd = () => ((_s = (_s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const pick = (a) => a[Math.floor(rnd() * a.length)];
const int = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));
const some = (a, n) => { const c = [...a]; const out = []; for (let i = 0; i < n && c.length; i++) out.push(c.splice(Math.floor(rnd() * c.length), 1)[0]); return out; };

async function seedUser(u) {
  await prisma.analyticsUser.upsert({
    where: { email: u.email },
    create: { email: u.email, role: u.role, name: u.name },
    update: { role: u.role, name: u.name },
  });

  // Clean slate for this user's seed sessions (cascade messages first).
  const existing = await prisma.session.findMany({ where: { userEmail: u.email, id: { startsWith: `seed-${u.email.split('@')[0]}-` } }, select: { id: true } });
  const ids = existing.map((s) => s.id);
  if (ids.length) {
    await prisma.message.deleteMany({ where: { sessionId: { in: ids } } });
    await prisma.session.deleteMany({ where: { id: { in: ids } } });
  }

  const nSessions = int(14, 30);
  let created = 0;
  for (let i = 0; i < nSessions; i++) {
    const sid = `seed-${u.email.split('@')[0]}-${i}`;
    const model = pick(MODELS);
    const project = pick(PROJECTS);
    const gitBranch = pick(BRANCHES);
    const startedAt = new Date(Date.now() - int(0, 29) * 864e5 - int(0, 23) * 3600e3 - int(0, 59) * 60e3);
    const endedAt = new Date(startedAt.getTime() + int(3, 180) * 60e3);
    const nMsgs = int(4, 60);

    const agg = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreateTokens: 0, costUsd: 0 };
    const messages = [];
    for (let j = 0; j < nMsgs; j++) {
      const isUser = j % 2 === 0;
      const ts = new Date(startedAt.getTime() + Math.floor((endedAt - startedAt) * (j / nMsgs)));
      if (isUser) {
        messages.push({ uuid: `${sid}-m${j}`, sessionId: sid, role: 'user', seq: j, text: `prompt ${j} in ${project}`, ts });
      } else {
        const inTok = int(2000, 15000), outTok = int(150, 2500), cr = int(8000, 400000), cc = int(0, 9000);
        const tools = rnd() < 0.6 ? some(TOOLS, int(1, 3)) : [];
        agg.inputTokens += inTok; agg.outputTokens += outTok; agg.cacheReadTokens += cr; agg.cacheCreateTokens += cc;
        agg.costUsd += costFor(model, { input: inTok, output: outTok, cacheRead: cr, cacheWrite: cc });
        messages.push({
          uuid: `${sid}-m${j}`, sessionId: sid, role: 'assistant', seq: j,
          text: `response ${j}`, thinking: rnd() < 0.4 ? `reasoning ${j}` : null, model, ts,
          inputTokens: inTok, outputTokens: outTok, cacheReadTokens: cr, cacheCreateTokens: cc,
          toolNames: tools, isSidechain: rnd() < 0.1,
        });
      }
    }
    await prisma.session.create({
      data: {
        id: sid, userEmail: u.email, project, gitBranch, model, startedAt, endedAt, msgCount: nMsgs,
        inputTokens: BigInt(agg.inputTokens), outputTokens: BigInt(agg.outputTokens),
        cacheReadTokens: BigInt(agg.cacheReadTokens), cacheCreateTokens: BigInt(agg.cacheCreateTokens),
        costUsd: agg.costUsd,
      },
    });
    await prisma.message.createMany({ data: messages, skipDuplicates: true });
    created++;
  }
  return created;
}

async function run() {
  const counts = {};
  for (const u of USERS) counts[u.email] = await seedUser(u);

  // Pod led by lead@, containing the two ICs → lead sees ic1/ic2 metrics.
  await prisma.pod.upsert({
    where: { id: POD_ID },
    create: { id: POD_ID, name: 'Pod Alpha', leadEmail: 'lead@devxlabs.ai' },
    update: { name: 'Pod Alpha', leadEmail: 'lead@devxlabs.ai' },
  });
  for (const email of POD_MEMBERS) {
    await prisma.podMembership.upsert({
      where: { podId_userEmail: { podId: POD_ID, userEmail: email } },
      create: { podId: POD_ID, userEmail: email }, update: {},
    });
  }

  console.log('seeded sessions per user:', counts);
  console.log('pod:', POD_ID, 'lead=lead@devxlabs.ai members=', POD_MEMBERS.join(','));
  await prisma.$disconnect();
}

run().catch((e) => { console.error(e); process.exit(1); });
