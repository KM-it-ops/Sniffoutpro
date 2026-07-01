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

export function getDb(): Database {
  const url = resolveDatabaseUrl();
  if (cached?.url === url) {
    return cached.db;
  }
  cached = { url, db: createDb(url) };
  return cached.db;
}
