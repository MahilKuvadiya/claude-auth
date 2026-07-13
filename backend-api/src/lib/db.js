// Prisma client singleton. Cloud Run may spin up several instances; within one process
// we keep a single client (connection pool). DATABASE_URL is injected from Secret Manager
// (claudex-dburl-<env>) and points at the Cloud SQL unix socket via the connector.
import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient({
  log: process.env.PRISMA_LOG ? ['query', 'warn', 'error'] : ['warn', 'error'],
});

// BigInt columns (token totals) don't survive JSON.stringify by default. Callers that
// return Prisma rows over HTTP pass them through this to coerce BigInt → Number.
export function serializeBigInts(value) {
  if (typeof value === 'bigint') return Number(value);
  if (value instanceof Date) return value;
  if (Array.isArray(value)) return value.map(serializeBigInts);
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = serializeBigInts(v);
    return out;
  }
  return value;
}
