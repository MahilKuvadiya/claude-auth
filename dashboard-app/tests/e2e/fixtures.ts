import type { Page, Route } from '@playwright/test';

export type Role = 'admin' | 'pod_lead' | 'member';

const totals = {
  sessions: 42, messages: 3120, inputTokens: 1_200_000, outputTokens: 900_000,
  cacheReadTokens: 48_000_000, cacheCreateTokens: 3_000_000, costUsd: 812.5,
  activeUsers: 4, activeDays: 18, avgDurationMs: 42 * 60_000,
};
const activity = Array.from({ length: 14 }, (_, i) => ({
  date: `2026-07-${String(i + 1).padStart(2, '0')}`,
  sessions: 2 + (i % 4), messages: 120 + i * 5,
  inputTokens: 80_000 + i * 1000, outputTokens: 60_000 + i * 800,
  cacheReadTokens: 3_000_000 + i * 5000, cacheCreateTokens: 200_000, costUsd: 40 + i,
}));
const users = [
  { email: 'admin@devxlabs.ai', name: 'Ada Admin', role: 'admin', sessions: 20, messages: 1500, inputTokens: 600000, outputTokens: 400000, cacheReadTokens: 20000000, cacheCreateTokens: 1500000, costUsd: 400 },
  { email: 'lead@devxlabs.ai', name: 'Leo Lead', role: 'pod_lead', sessions: 12, messages: 900, inputTokens: 300000, outputTokens: 250000, cacheReadTokens: 15000000, cacheCreateTokens: 900000, costUsd: 250 },
  { email: 'ic1@devxlabs.ai', name: 'Ivy One', role: 'member', sessions: 10, messages: 720, inputTokens: 300000, outputTokens: 250000, cacheReadTokens: 13000000, cacheCreateTokens: 600000, costUsd: 162 },
];
const breakdown = (by: string) => {
  if (by === 'model') return [
    { key: 'claude-opus-4-8', sessions: 30, costUsd: 600, inputTokens: 900000, outputTokens: 700000, cacheReadTokens: 30000000, cacheCreateTokens: 2000000 },
    { key: 'claude-sonnet-5', sessions: 8, costUsd: 150, inputTokens: 200000, outputTokens: 150000, cacheReadTokens: 12000000, cacheCreateTokens: 700000 },
    { key: 'claude-haiku-4-5', sessions: 4, costUsd: 62, inputTokens: 100000, outputTokens: 50000, cacheReadTokens: 6000000, cacheCreateTokens: 300000 },
  ];
  if (by === 'project') return [
    { key: '/work/ai-chatbot', sessions: 15, costUsd: 320 }, { key: '/work/claudex', sessions: 12, costUsd: 260 },
    { key: '/work/agent-repo', sessions: 8, costUsd: 140 }, { key: '/work/finetune', sessions: 7, costUsd: 92 },
  ];
  if (by === 'tool') return [
    { key: 'Bash', count: 320 }, { key: 'Edit', count: 210 }, { key: 'Read', count: 180 }, { key: 'Grep', count: 90 },
  ];
  if (by === 'weekday') return Array.from({ length: 7 }, (_, i) => ({ key: i, sessions: 3 + i, messages: 100, costUsd: 20 }));
  return Array.from({ length: 24 }, (_, h) => ({ key: h, sessions: (h % 12) + 1, messages: 40, costUsd: 8 })); // hour
};
const sessions = Array.from({ length: 8 }, (_, i) => ({
  id: `sess-${i}`, userEmail: 'ic1@devxlabs.ai', project: '/work/claudex', gitBranch: 'main', model: 'claude-opus-4-8',
  startedAt: '2026-07-10T10:00:00Z', endedAt: '2026-07-10T11:00:00Z', msgCount: 20 + i,
  inputTokens: 50000, outputTokens: 40000, cacheReadTokens: 2000000, cacheCreateTokens: 150000, costUsd: 30 + i,
}));
const thread = {
  session: sessions[0],
  messages: [
    { uuid: 'm1', role: 'user', seq: 0, text: 'build the dashboard', ts: '2026-07-10T10:00:00Z', inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreateTokens: 0, toolNames: [], isSidechain: false },
    { uuid: 'm2', role: 'assistant', seq: 1, text: 'on it', thinking: 'plan…', model: 'claude-opus-4-8', ts: '2026-07-10T10:01:00Z', inputTokens: 5000, outputTokens: 800, cacheReadTokens: 200000, cacheCreateTokens: 3000, toolNames: ['Edit', 'Bash'], isSidechain: false },
  ],
};

/** Intercept every /v1/* call with role-appropriate fixtures. Admin-only routes 403 for others. */
export async function mockApi(page: Page, role: Role) {
  await page.route('**/v1/**', (route: Route) => {
    const url = new URL(route.request().url());
    const p = url.pathname;
    const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    const adminOnly = () => (role === 'admin' ? null : json({ error: { code: 'forbidden', message: 'admin only', requestId: 'x' } }, 403));

    if (p.endsWith('/v1/me')) return json({ email: `${role}@devxlabs.ai`, role, orgId: null });
    if (p.endsWith('/v1/analytics/summary')) return json({ scope: role, totals });
    if (p.endsWith('/v1/analytics/activity')) return json({ scope: role, activity });
    if (p.endsWith('/v1/analytics/users')) return json({ scope: role, users });
    if (p.endsWith('/v1/analytics/breakdown')) return json({ scope: role, by: url.searchParams.get('by'), items: breakdown(url.searchParams.get('by') || 'model') });
    if (p.includes('/v1/analytics/sessions/')) return adminOnly() ?? json(thread);
    if (p.endsWith('/v1/analytics/sessions')) return adminOnly() ?? json({ total: sessions.length, sessions });
    if (p.endsWith('/v1/pools')) return json({ pools: [{ id: 'pl_demo', name: 'Demo pool', mode: 'failover', status: 'active', orgId: null }] });
    if (p.endsWith('/v1/admin/users')) return adminOnly() ?? json({ users });
    if (p.endsWith('/v1/admin/pods')) return adminOnly() ?? json({ pods: [{ id: 'pod1', name: 'Pod Alpha', leadEmail: 'lead@devxlabs.ai', members: ['ic1@devxlabs.ai'] }] });
    return json({});
  });
}

/** Navigate to a hash route as a given E2E role. */
export const gotoAs = (page: Page, role: Role, hashPath = '/') => page.goto(`/#${hashPath}?e2e=${role}`);
