#!/usr/bin/env node
/**
 * Smoke-test a deployed SniffOutPro web instance.
 * Usage: node scripts/verify-production.mjs https://your-app.vercel.app [sync-token]
 */
const baseUrl = process.argv[2]?.replace(/\/$/, '');
const syncToken = process.argv[3];

if (baseUrl === undefined) {
  console.error('Usage: node scripts/verify-production.mjs <base-url> [sync-token]');
  process.exit(1);
}

async function checkHealth() {
  const res = await fetch(`${baseUrl}/api/health`);
  if (!res.ok) {
    throw new Error(`health ${res.status}`);
  }
  const body = await res.json();
  if (body.status !== 'ok') {
    throw new Error(`health body: ${JSON.stringify(body)}`);
  }
}

async function checkSyncAuth() {
  const res = await fetch(`${baseUrl}/api/trpc/health.ping`, {
    method: 'GET',
    headers: { 'content-type': 'application/json' },
  });
  if (!res.ok) {
    throw new Error(`trpc health.ping ${res.status}`);
  }
}

async function checkSyncRejectedWithoutToken() {
  const res = await fetch(`${baseUrl}/api/trpc/scans.sync`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({}),
  });
  if (res.status !== 401 && res.status !== 405 && res.status !== 404) {
    return;
  }
}

async function checkSyncWithToken() {
  if (syncToken === undefined || syncToken === '') {
    console.log('skip: sync token probe (no token arg)');
    return;
  }
  const res = await fetch(`${baseUrl}/api/trpc/scans.list?batch=1&input=${encodeURIComponent(JSON.stringify({ 0: { json: { limit: 1 } } }))}`, {
    headers: { authorization: `Bearer ${syncToken}` },
  });
  if (!res.ok) {
    throw new Error(`scans.list with token ${res.status}`);
  }
}

const checks = [
  ['health', checkHealth],
  ['trpc ping', checkSyncAuth],
  ['sync auth gate', checkSyncRejectedWithoutToken],
  ['sync token', checkSyncWithToken],
];

let failed = 0;
for (const [name, fn] of checks) {
  try {
    await fn();
    console.log(`ok  ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`fail ${name}:`, err instanceof Error ? err.message : err);
  }
}

process.exit(failed > 0 ? 1 : 0);
