#!/usr/bin/env node
/**
 * Apply Drizzle migrations using DATABASE_URL from a dotenv file.
 * Never prints the connection string.
 *
 * Usage: node scripts/migrate-from-env.mjs [.local/vercel-production.env]
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const envPath = resolve(root, process.argv[2] ?? '.local/vercel-production.env');

if (!existsSync(envPath)) {
  console.error(`Env file not found: ${envPath}`);
  process.exit(1);
}

function parseEnvFile(contents) {
  const out = {};
  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

const parsed = parseEnvFile(readFileSync(envPath, 'utf8'));
const databaseUrl = parsed['DATABASE_URL'];
if (databaseUrl === undefined || databaseUrl.length === 0) {
  console.error('DATABASE_URL missing or empty in env file');
  process.exit(1);
}

let host = '(unparsed)';
try {
  const u = new URL(databaseUrl.replace(/^postgresql:/i, 'http:').replace(/^postgres:/i, 'http:'));
  host = `${u.hostname}:${u.port || '5432'}`;
} catch {
  host = '(invalid-url)';
}

console.log(`Migrating via env file (host ${host}, url length ${String(databaseUrl.length)})…`);

const result = spawnSync(
  process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm',
  ['--filter', '@sniffoutpro/db', 'db:migrate'],
  {
    cwd: root,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: 'inherit',
    shell: true,
  },
);

process.exit(result.status ?? 1);
