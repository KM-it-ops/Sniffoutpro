#!/usr/bin/env node
/**
 * Set Vercel production DATABASE_URL from Supabase pooler.
 * Usage: $env:SUPABASE_DB_PASSWORD='your-password'; node scripts/set-database-url.mjs
 */
import { spawnSync } from 'node:child_process';

const SCOPE = 'km-it-ops-projects';
const PROJECT_REF = 'nwzcfwduwddkkvqlbfqo';
const password = process.env['SUPABASE_DB_PASSWORD']?.trim();

if (!password) {
  console.error('Set SUPABASE_DB_PASSWORD first (Supabase → Project Settings → Database).');
  process.exit(1);
}

const encoded = encodeURIComponent(password);
const databaseUrl = `postgresql://postgres.${PROJECT_REF}:${encoded}@aws-1-us-east-2.pooler.supabase.com:6543/postgres?pgbouncer=true&sslmode=require`;

const ps = [
  '$ErrorActionPreference = "Stop"',
  `$value = '${databaseUrl.replace(/'/g, "''")}'`,
  `vercel env update DATABASE_URL production --yes --value $value --scope ${SCOPE}`,
].join('; ');

const result = spawnSync('powershell', ['-NoProfile', '-Command', ps], {
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'],
});

if (result.status !== 0) {
  console.error(result.stderr || result.stdout || 'vercel env update failed');
  process.exit(1);
}

console.log('DATABASE_URL updated — redeploy: vercel deploy --prod --yes --scope km-it-ops-projects');
