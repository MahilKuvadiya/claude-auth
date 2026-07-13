import { z } from 'zod';

// Validated at the API boundary — no `any` reaches the UI. Shapes mirror
// backend-api/openapi/claudex.v1.yaml.
export const Pool = z.object({
  id: z.string(),
  name: z.string(),
  mode: z.enum(['failover', 'balance']).catch('failover'),
  status: z.string().default('active'),
  orgId: z.string().nullable().optional(),
});
export type Pool = z.infer<typeof Pool>;

export const TokenTally = z.object({
  tokensIn: z.number().default(0),
  tokensOut: z.number().default(0),
  cacheRead: z.number().default(0),
  cacheWrite: z.number().default(0),
  requests: z.number().default(0),
}).partial();
export type TokenTally = z.infer<typeof TokenTally>;

export const Member = z.object({
  memberId: z.string(),
  email: z.string().nullable().optional(),
  name: z.string().optional(),
  status: z.enum(['active', 'resting', 'revoked']).catch('active'),
  subscriptionType: z.string().nullable().optional(),
  rateLimit: z
    .object({ fiveHourPct: z.number().nullable(), weeklyPct: z.number().nullable() })
    .partial()
    .nullable()
    .optional(),
  consumed: TokenTally.optional(),
  contributed: TokenTally.optional(),
});
export type Member = z.infer<typeof Member>;

export const Rollup = z.object({
  id: z.string(), // period, e.g. 2026-07-11
  tokensIn: z.number().default(0),
  tokensOut: z.number().default(0),
  cacheRead: z.number().default(0),
  cacheWrite: z.number().default(0),
  requests: z.number().default(0),
  byMember: z.record(z.object({ consumed: TokenTally.optional(), contributed: TokenTally.optional() }).partial()).optional(),
});
export type Rollup = z.infer<typeof Rollup>;

// ---- analytics ----
export const Me = z.object({
  email: z.string(),
  role: z.enum(['admin', 'pod_lead', 'member']).catch('member'),
  orgId: z.string().nullable().optional(),
});
export type Me = z.infer<typeof Me>;

export const Summary = z.object({
  scope: z.string(),
  totals: z.object({
    sessions: z.number().default(0),
    messages: z.number().default(0),
    inputTokens: z.number().default(0),
    outputTokens: z.number().default(0),
    cacheReadTokens: z.number().default(0),
    cacheCreateTokens: z.number().default(0),
    costUsd: z.number().default(0),
  }),
});
export type Summary = z.infer<typeof Summary>;

export const UserRow = z.object({
  email: z.string(),
  name: z.string(),
  role: z.string(),
  sessions: z.number().default(0),
  messages: z.number().default(0),
  inputTokens: z.number().default(0),
  outputTokens: z.number().default(0),
  cacheReadTokens: z.number().default(0),
  cacheCreateTokens: z.number().default(0),
  costUsd: z.number().default(0),
});
export type UserRow = z.infer<typeof UserRow>;

export const ActivityPoint = z.object({
  date: z.string(),
  sessions: z.coerce.number().default(0),
  tokens: z.coerce.number().default(0),
  cost: z.coerce.number().default(0),
});
export type ActivityPoint = z.infer<typeof ActivityPoint>;

export const SessionMeta = z.object({
  id: z.string(),
  userEmail: z.string(),
  project: z.string().nullable().optional(),
  gitBranch: z.string().nullable().optional(),
  model: z.string().nullable().optional(),
  startedAt: z.string().nullable().optional(),
  endedAt: z.string().nullable().optional(),
  msgCount: z.number().default(0),
  inputTokens: z.number().default(0),
  outputTokens: z.number().default(0),
  cacheReadTokens: z.number().default(0),
  cacheCreateTokens: z.number().default(0),
  costUsd: z.number().default(0),
});
export type SessionMeta = z.infer<typeof SessionMeta>;

export const SessionMessage = z.object({
  uuid: z.string(),
  role: z.string(),
  seq: z.number().default(0),
  text: z.string().nullable().optional(),
  thinking: z.string().nullable().optional(),
  model: z.string().nullable().optional(),
  ts: z.string().nullable().optional(),
  inputTokens: z.number().default(0),
  outputTokens: z.number().default(0),
  toolNames: z.array(z.string()).default([]),
  isSidechain: z.boolean().default(false),
});
export type SessionMessage = z.infer<typeof SessionMessage>;

export const JoinLink = z.object({
  joinToken: z.string(),
  targetEmail: z.string(),
  role: z.string().default('member'),
  used: z.boolean().default(false),
  memberId: z.string().nullable().optional(),
  expiresAt: z.number().nullable().optional(),
  command: z.string(),
});
export type JoinLink = z.infer<typeof JoinLink>;
