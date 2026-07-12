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
