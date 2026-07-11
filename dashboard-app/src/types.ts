import { z } from 'zod';

// Validated at every Firestore/API boundary — no `any` reaches the UI.
export const Pool = z.object({
  id: z.string(),
  name: z.string(),
  mode: z.enum(['failover', 'balance']).catch('failover'),
  status: z.string().default('active'),
  orgId: z.string().nullable().optional(),
});
export type Pool = z.infer<typeof Pool>;

export const Member = z.object({
  id: z.string(),
  email: z.string().optional(),
  status: z.enum(['active', 'resting', 'revoked']).catch('active'),
  accountUuid: z.string().nullable().optional(),
  rateLimit: z
    .object({ fiveHourPct: z.number().nullable(), weeklyPct: z.number().nullable() })
    .partial()
    .nullable()
    .optional(),
  lastServedAt: z.number().nullable().optional(),
});
export type Member = z.infer<typeof Member>;

const TokenTally = z.object({
  tokensIn: z.number().default(0),
  tokensOut: z.number().default(0),
  cacheRead: z.number().default(0),
  cacheWrite: z.number().default(0),
  requests: z.number().default(0),
}).partial();
export type TokenTally = z.infer<typeof TokenTally>;

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
