#!/usr/bin/env node
/**
 * Fetch decrypted Production DATABASE_URL from Vercel API and run drizzle migrate.
 * Never prints the URL. Writes nothing to disk.
 *
 * Usage: node scripts/migrate-via-vercel-api.mjs
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { homedir } from 'node:os';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const projectJson = JSON.parse(readFileSync(join(root, '.vercel/project.json'), 'utf8'));
const projectId = projectJson.projectId;
const teamId = projectJson.orgId;

function findAuthToken() {
  const candidates = [
    join(homedir(), 'AppData/Roaming/xdg.data/com.vercel.cli/auth.json'),
    join(homedir(), 'AppData/Roaming/com.vercel.cli/auth.json'),
    join(homedir(), '.local/share/com.vercel.cli/auth.json'),
    join(process.env['APPDATA'] ?? '', 'com.vercel.cli/auth.json'),
  ];
  for (const p of candidates) {
    if (!p || !existsSync(p)) continue;
    try {
      const auth = JSON.parse(readFileSync(p, 'utf8'));
      const token = auth.token ?? auth.accessToken ?? auth['//token'];
      if (typeof token === 'string' && token.length > 0) return token;
    } catch {
      // continue
    }
  }
  return null;
}

async function vercelFetch(path, token) {
  const url = new URL(`https://api.vercel.com${path}`);
  if (teamId) url.searchParams.set('teamId', teamId);
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = { raw: text };
  }
  return { ok: res.ok, status: res.status, body };
}

async function main() {
  const token = findAuthToken();
  if (token === null) {
    console.error('No Vercel auth token found in CLI auth.json');
    process.exit(1);
  }
  console.log(`Vercel project ${projectId} team ${teamId}`);

  // List env vars
  const listed = await vercelFetch(`/v9/projects/${projectId}/env`, token);
  if (!listed.ok) {
    console.error('Failed to list env', listed.status, JSON.stringify(listed.body).slice(0, 200));
    process.exit(1);
  }

  const envs = listed.body.envs ?? listed.body;
  const dbEnv = Array.isArray(envs)
    ? envs.find((e) => e.key === 'DATABASE_URL' && (e.target?.includes('production') || e.target === 'production'))
    : null;

  if (!dbEnv) {
    const keys = Array.isArray(envs) ? envs.map((e) => `${e.key}:${JSON.stringify(e.target)}`) : [];
    console.error('DATABASE_URL production entry not found. Keys:', keys.join(', '));
    process.exit(1);
  }

  console.log(`Found DATABASE_URL id=${dbEnv.id} type=${dbEnv.type ?? 'unknown'} sensitive=${String(dbEnv.sensitive ?? false)}`);

  // Try decrypt endpoints (Vercel has varied these over time)
  const decryptPaths = [
    `/v1/projects/${projectId}/env/${dbEnv.id}`,
    `/v9/projects/${projectId}/env/${dbEnv.id}`,
    `/v10/projects/${projectId}/env/${dbEnv.id}`,
    `/v8/env/${dbEnv.id}`,
  ];

  let databaseUrl = typeof dbEnv.value === 'string' && dbEnv.value.length > 0 ? dbEnv.value : null;

  for (const path of decryptPaths) {
    if (databaseUrl !== null) break;
    const res = await vercelFetch(path, token);
    const keys = res.body && typeof res.body === 'object' ? Object.keys(res.body) : [];
    const nested = res.body?.env && typeof res.body.env === 'object' ? Object.keys(res.body.env) : [];
    const valueCandidate = res.body?.value ?? res.body?.env?.value ?? res.body?.decryptedValue;
    const valueLen = typeof valueCandidate === 'string' ? valueCandidate.length : -1;
    console.log(
      `decrypt ${path} → ${String(res.status)} keys=[${keys.join(',')}] nested=[${nested.join(',')}] valueLen=${String(valueLen)}`,
    );
    if (typeof valueCandidate === 'string' && valueCandidate.length > 0) {
      databaseUrl = valueCandidate;
    }
  }

  // Some Vercel API versions require ?decrypt=true
  if (databaseUrl === null) {
    const decryptQueryPaths = [
      `/v1/projects/${projectId}/env/${dbEnv.id}?decrypt=true`,
      `/v9/projects/${projectId}/env/${dbEnv.id}?decrypt=true`,
      `/v10/projects/${projectId}/env/${dbEnv.id}?decrypt=true`,
    ];
    for (const path of decryptQueryPaths) {
      if (databaseUrl !== null) break;
      // path already has query; vercelFetch also adds teamId
      const url = new URL(`https://api.vercel.com${path.split('?')[0]}`);
      if (teamId) url.searchParams.set('teamId', teamId);
      url.searchParams.set('decrypt', 'true');
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      const body = await res.json();
      const keys = body && typeof body === 'object' ? Object.keys(body) : [];
      const valueCandidate = body?.value ?? body?.env?.value ?? body?.decryptedValue;
      const valueLen = typeof valueCandidate === 'string' ? valueCandidate.length : -1;
      console.log(
        `decrypt?true ${url.pathname} → ${String(res.status)} keys=[${keys.join(',')}] valueLen=${String(valueLen)}`,
      );
      if (typeof valueCandidate === 'string' && valueCandidate.length > 0) {
        databaseUrl = valueCandidate;
      }
    }
  }

  if (databaseUrl === null || databaseUrl.length === 0) {
    console.error(
      'Could not decrypt DATABASE_URL (Sensitive vars are often non-readable via API).',
    );
    console.error('Boss must paste pooler URL into .local/database-url.txt (gitignored) or unset Sensitive.');
    process.exit(2);
  }

  let host = '(unparsed)';
  try {
    const u = new URL(
      databaseUrl.replace(/^postgresql:/i, 'http:').replace(/^postgres:/i, 'http:'),
    );
    host = `${u.hostname}:${u.port || '5432'}`;
  } catch {
    host = '(invalid)';
  }
  console.log(`Migrating (host ${host}, url length ${String(databaseUrl.length)})…`);

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
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
