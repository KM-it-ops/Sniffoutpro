#!/usr/bin/env node
/**
 * Probe prod DB connectivity. Never prints the URL/password.
 * Usage: SUPABASE_DB_PASSWORD=... node scripts/probe-db.mjs
 *    or: DATABASE_URL=... node scripts/probe-db.mjs
 */
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const postgres = require(
  join(dirname(fileURLToPath(import.meta.url)), '../packages/db/node_modules/postgres'),
);

const PROJECT_REF = 'nwzcfwduwddkkvqlbfqo';
const POOLER_HOST = 'aws-1-us-east-2.pooler.supabase.com';

function resolveUrl() {
  if (process.env['DATABASE_URL']?.trim()) return process.env['DATABASE_URL'].trim();
  const password = process.env['SUPABASE_DB_PASSWORD']?.trim();
  if (!password) {
    console.error('Need DATABASE_URL or SUPABASE_DB_PASSWORD');
    process.exit(2);
  }
  const encoded = encodeURIComponent(password);
  // Session pooler (:5432) for DDL/migrations; transaction (:6543) for app runtime.
  const port = process.env['SNIFFOUT_DB_PORT'] ?? '5432';
  const qs =
    port === '6543'
      ? 'pgbouncer=true&sslmode=require'
      : 'sslmode=require';
  return `postgresql://postgres.${PROJECT_REF}:${encoded}@${POOLER_HOST}:${port}/postgres?${qs}`;
}

const url = resolveUrl();
const sql = postgres(url, { max: 1, prepare: false, connect_timeout: 20, ssl: 'require' });

try {
  const rows = await sql`select current_database() as db, current_user as usr`;
  console.log('CONNECT_OK', rows[0]?.db, rows[0]?.usr);

  const cols = await sql`
    select column_name
    from information_schema.columns
    where table_schema = 'public' and table_name = 'findings'
    order by ordinal_position
  `;
  console.log('FINDINGS_COLS', cols.map((c) => c.column_name).join(','));

  const hostCols = await sql`
    select column_name
    from information_schema.columns
    where table_schema = 'public' and table_name = 'hosts'
    order by ordinal_position
  `;
  console.log('HOSTS_COLS', hostCols.map((c) => c.column_name).join(','));

  try {
    const mig = await sql`select id, hash, created_at from drizzle.__drizzle_migrations order by created_at`;
    console.log(
      'MIGRATIONS',
      mig.length,
      mig.map((m) => `${String(m.id)}:${String(m.hash).slice(0, 12)}`).join('|'),
    );
  } catch (e) {
    console.log('MIGRATIONS_ERR', e instanceof Error ? e.message : e);
  }

  await sql.end();
  process.exit(0);
} catch (e) {
  const err = e;
  console.log(
    'CONNECT_FAIL',
    typeof err === 'object' && err !== null && 'code' in err ? String(err.code) : '',
    err instanceof Error ? err.message : String(err),
  );
  try {
    await sql.end({ timeout: 1 });
  } catch {
    // ignore
  }
  process.exit(1);
}
