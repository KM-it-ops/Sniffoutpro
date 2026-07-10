#!/usr/bin/env node
/**
 * Apply Drizzle migrations using a gitignored DATABASE_URL file.
 *
 * Preferred (Boss):
 *   1. Supabase → Project Settings → Database → copy Transaction pooler URI (:6543)
 *   2. Write ONLY the URL (one line) to .local/database-url.txt
 *   3. node scripts/migrate-from-file.mjs
 *
 * Alternate: SUPABASE_DB_PASSWORD env → builds pooler URL for ref nwzcfwduwddkkvqlbfqo
 *
 * Never prints the connection string.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, unlinkSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PROJECT_REF = 'nwzcfwduwddkkvqlbfqo';
const POOLER_HOST = 'aws-1-us-east-2.pooler.supabase.com';

function resolveDatabaseUrl() {
  const fileArg = process.argv[2];
  const candidates = [
    fileArg,
    '.local/database-url.txt',
    '.local/database-url.env',
  ]
    .filter(Boolean)
    .map((p) => resolve(root, p));

  for (const path of candidates) {
    if (!existsSync(path)) continue;
    const raw = readFileSync(path, 'utf8').trim();
    if (raw.startsWith('DATABASE_URL=')) {
      let v = raw.slice('DATABASE_URL='.length).trim();
      if (
        (v.startsWith('"') && v.endsWith('"')) ||
        (v.startsWith("'") && v.endsWith("'"))
      ) {
        v = v.slice(1, -1);
      }
      if (v.length > 0) return { url: v, source: path };
    } else if (raw.startsWith('postgres')) {
      const firstLine = raw.split(/\r?\n/)[0]?.trim() ?? '';
      if (firstLine.length > 0) return { url: firstLine, source: path };
    }
  }

  const password = process.env['SUPABASE_DB_PASSWORD']?.trim();
  if (password) {
    const encoded = encodeURIComponent(password);
    // Use session pooler (:5432) for migrations — transaction pooler (:6543) breaks DDL.
    const port = process.env['SNIFFOUT_DB_PORT'] ?? '5432';
    const qs =
      port === '6543'
        ? 'pgbouncer=true&sslmode=require'
        : 'sslmode=require';
    return {
      url: `postgresql://postgres.${PROJECT_REF}:${encoded}@${POOLER_HOST}:${port}/postgres?${qs}`,
      source: `SUPABASE_DB_PASSWORD (port ${port})`,
    };
  }

  if (process.env['DATABASE_URL']?.trim()) {
    return { url: process.env['DATABASE_URL'].trim(), source: 'process.env.DATABASE_URL' };
  }

  return null;
}

const resolved = resolveDatabaseUrl();
if (resolved === null) {
  console.error(`No DATABASE_URL available.

Vercel marks Production DATABASE_URL as Sensitive — env pull returns empty.

Do ONE of:
  A) Write pooler URI to .local/database-url.txt  (one line, gitignored)
  B) $env:SUPABASE_DB_PASSWORD='...' ; node scripts/migrate-from-file.mjs
  C) Unmark Sensitive on Vercel DATABASE_URL, then: vercel env pull .local/vercel-pull.env --environment production --yes --scope km-it-ops-projects
`);
  process.exit(2);
}

let host = '(unparsed)';
try {
  const u = new URL(
    resolved.url.replace(/^postgresql:/i, 'http:').replace(/^postgres:/i, 'http:'),
  );
  host = `${u.hostname}:${u.port || '5432'}`;
} catch {
  host = '(invalid-url)';
}

if (host.includes('127.0.0.1') || host.includes('localhost')) {
  console.error(`Refusing to migrate: URL points at ${host} (localhost). Use Supabase pooler :6543.`);
  process.exit(1);
}

console.log(`Migrating from ${resolved.source} (host ${host}, url length ${String(resolved.url.length)})…`);

const result = spawnSync(
  process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm',
  ['--filter', '@sniffoutpro/db', 'db:migrate'],
  {
    cwd: root,
    env: { ...process.env, DATABASE_URL: resolved.url },
    stdio: 'inherit',
    shell: true,
  },
);

process.exit(result.status ?? 1);
