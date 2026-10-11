import { createDb, type Database } from '@sniffoutpro/db';

let cached: { url: string; db: Database } | undefined;

export function resolveDatabaseUrl(): string {
  const fromEnv = process.env['DATABASE_URL']?.trim();
  if (fromEnv) {
    return fromEnv;
  }
  const deployed = process.env['VERCEL'] === '1' || process.env['VERCEL_ENV'] !== undefined;
  if (deployed || process.env['NODE_ENV'] === 'production') {
    throw new Error('DATABASE_URL is not configured');
  }
  return 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
}

/** Optional DATABASE_POOL_MAX caps open connections per server instance (default 10, set in createDb). */
export function resolvePoolMax(): number | undefined {
  const raw = process.env['DATABASE_POOL_MAX']?.trim();
  if (!raw) {
    return undefined;
  }
  const max = Number(raw);
  if (!Number.isInteger(max) || max < 1) {
    throw new Error('DATABASE_POOL_MAX must be a whole number of 1 or more');
  }
  return max;
}

export function getDb(): Database {
  const url = resolveDatabaseUrl();
  if (cached?.url === url) {
    return cached.db;
  }
  const max = resolvePoolMax();
  cached = { url, db: createDb(url, max === undefined ? {} : { max }) };
  return cached.db;
}
