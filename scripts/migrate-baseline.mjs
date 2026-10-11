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
 *   1. Reads the ledger's newest row and the public schema's tables, columns,
 *      constraints and indexes. Read-only so far.
 *   2. Records only the pre-ledger migrations (0000, 0001) whose every table,
 *      column, constraint and index already exists, stopping at the first one
 *      that is not (see scripts/migrate-baseline-plan.mjs). Everything else —
 *      including DDL applied by hand — is left for drizzle-kit, which applies
 *      it or fails loudly. On a fresh database nothing is recorded.
 *   3. Writes the rows in one transaction, using the journal `when` as
 *      created_at and sha256(file) as hash, as drizzle-kit does.
 *
 * Never prints DATABASE_URL or credentials. Usage:
 *   DATABASE_URL=... node scripts/migrate-baseline.mjs
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { planBaseline } from './migrate-baseline-plan.mjs';

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
const sqlByTag = new Map(
  journal.entries.map((entry) => [
    entry.tag,
    readFileSync(join(drizzleDir, `${entry.tag}.sql`), 'utf8'),
  ]),
);

const sql = postgres(url, { max: 1, prepare: false });
const names = (rows) => new Set(rows.map((r) => r.name));

try {
  const [{ ledger }] =
    await sql`select (to_regclass('drizzle.__drizzle_migrations') is not null) as ledger`;
  // Same row drizzle-kit compares against.
  const [newest] = ledger
    ? await sql`select created_at from drizzle.__drizzle_migrations order by created_at desc limit 1`
    : [];
  const ledgerHighWater = newest ? Number(newest.created_at) : null;

  const catalog = {
    tables: names(await sql`
      select c.relname as name from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind in ('r', 'p')`),
    columns: names(await sql`
      select c.relname || '.' || a.attname as name from pg_attribute a
      join pg_class c on c.oid = a.attrelid
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind in ('r', 'p')
        and a.attnum > 0 and not a.attisdropped`),
    constraints: names(await sql`
      select con.conname as name from pg_constraint con
      join pg_namespace n on n.oid = con.connamespace
      where n.nspname = 'public'`),
    indexes: names(await sql`
      select indexname as name from pg_indexes where schemaname = 'public'`),
  };

  const decisions = planBaseline({ entries: journal.entries, sqlByTag, ledgerHighWater, catalog });
  if (ledgerHighWater !== null) {
    console.log(`Ledger's newest row: created_at=${String(ledgerHighWater)}`);
  }
  for (const d of decisions) {
    console.log(`${d.record ? 'Record' : 'Leave '} ${d.tag}: ${d.reason}`);
  }

  const toRecord = decisions.filter((d) => d.record);
  if (toRecord.length === 0) {
    console.log('Nothing to baseline — drizzle-kit will apply whatever is not recorded.');
  } else {
    await sql.begin(async (tx) => {
      await tx`create schema if not exists drizzle`;
      await tx`create table if not exists drizzle.__drizzle_migrations (
        id serial primary key,
        hash text not null,
        created_at bigint
      )`;
      for (const d of toRecord) {
        const hash = createHash('sha256').update(sqlByTag.get(d.tag)).digest('hex');
        await tx`insert into drizzle.__drizzle_migrations (hash, created_at)
                 values (${hash}, ${d.when})`;
      }
    });
    console.log(`Baseline complete: ${String(toRecord.length)} entries recorded.`);
  }
} finally {
  await sql.end();
}
