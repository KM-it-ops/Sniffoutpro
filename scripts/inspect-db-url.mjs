#!/usr/bin/env node
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const envPath = resolve(process.argv[2] ?? '.local/vercel-production.env');
if (!existsSync(envPath)) {
  console.log('NO_FILE', envPath);
  process.exit(1);
}

const raw = readFileSync(envPath, 'utf8');
console.log('FILE_BYTES', Buffer.byteLength(raw));
console.log('HAS_BOM', raw.charCodeAt(0) === 0xfeff);
console.log('LINE_COUNT', raw.split(/\r?\n/).length);

const lines = raw.split(/\r?\n/);
const dbLine = lines.find((l) => /^DATABASE_URL\s*=/.test(l));
console.log('DB_LINE_FOUND', Boolean(dbLine));
if (!dbLine) {
  const keys = lines
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => l.split('=')[0]?.trim())
    .filter(Boolean);
  console.log('KEYS', keys.join(','));
  process.exit(1);
}

let value = dbLine.replace(/^DATABASE_URL\s*=\s*/, '').trim();
if (
  (value.startsWith('"') && value.endsWith('"')) ||
  (value.startsWith("'") && value.endsWith("'"))
) {
  value = value.slice(1, -1);
}

console.log('VALUE_LEN', value.length);
console.log('PREFIX', value.slice(0, 12));
console.log('HAS_AT', value.includes('@'));
console.log('HAS_AMP', value.includes('&'));
console.log('HAS_PGBOUNCER', value.includes('pgbouncer'));
console.log('HAS_SSLMODE', value.includes('sslmode'));

try {
  const u = new URL(
    value.replace(/^postgresql:/i, 'http:').replace(/^postgres:/i, 'http:'),
  );
  console.log('HOST', u.hostname);
  console.log('PORT', u.port || '(default)');
  console.log('USER_LEN', u.username.length);
  console.log('PASS_LEN', u.password.length);
  console.log('PATH', u.pathname);
} catch (e) {
  console.log('URL_PARSE_ERR', e instanceof Error ? e.message : e);
}
