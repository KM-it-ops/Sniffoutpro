#!/usr/bin/env node
/**
 * Baseline drizzle's migration ledger before running `drizzle-kit migrate`.
 *
 * Why: prod's schema was created before the ledger existed (0000 via early
 * tooling, 0001 via the Supabase MCP as 'audit_hardening' — see the header of
 * packages/db/drizzle/0001_audit_hardening.sql). With no rows in
 * drizzle.__drizzle_migrations, `drizzle-kit migrate` re-runs 0000's plain
 * CREATE TABLE statements against existing tables and fails.
 *
 * What this does (idempotent):
 *   1. If the public schema has no scan_runs table (fresh DB), do nothing —
 *      let drizzle-kit create everything.
 *   2. Otherwise ensure drizzle.__drizzle_migrations exists and contains one
 *      row per journal entry whose tables/DDL are already applied, using the
 *      journal `when` as created_at and sha256(file) as hash.
 *
 * Never prints DATABASE_URL or credentials. Usage:
 *   DATABASE_URL=... node scripts/migrate-baseline.mjs
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const postgres = require(join(here, '../packages/db/node_modules/postgres'));

const url = process.env['DATABASE_URL']?.trim();
if (!url) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}

const drizzleDir = join(here, '../packages/db/drizzle');
const journal = JSON.parse(readFileSync(join(drizzleDir, 'meta/_journal.json'), 'utf8'));

const sql = postgres(url, { max: 1, prepare: false });

try {
  const [{ exists }] =
    await sql`select (to_regclass('public.scan_runs') is not null) as exists`;
  if (!exists) {
    console.log('Fresh database detected — no baseline needed.');
    process.exit(0);
  }

  await sql`create schema if not exists drizzle`;
  await sql`create table if not exists drizzle.__drizzle_migrations (
    id serial primary key,
    hash text not null,
    created_at bigint
  )`;

  const applied = await sql`select created_at from drizzle.__drizzle_migrations`;
  const appliedAt = new Set(applied.map((r) => String(r.created_at)));

  let inserted = 0;
  for (const entry of journal.entries) {
    if (appliedAt.has(String(entry.when))) continue;
    const file = readFileSync(join(drizzleDir, `${entry.tag}.sql`), 'utf8');
    const hash = createHash('sha256').update(file).digest('hex');
    await sql`insert into drizzle.__drizzle_migrations (hash, created_at)
              values (${hash}, ${entry.when})`;
    inserted += 1;
    console.log(`Baselined ${entry.tag} (when=${String(entry.when)})`);
  }
  console.log(
    inserted === 0
      ? 'Ledger already consistent — nothing to baseline.'
      : `Baseline complete: ${String(inserted)} entries recorded.`,
  );
} finally {
  await sql.end();
}
