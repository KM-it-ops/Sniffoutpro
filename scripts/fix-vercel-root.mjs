#!/usr/bin/env node
/**
 * One-shot: reset sniffoutpro-web to standard Turborepo monorepo settings.
 * Run after `vercel login`. No copy hacks — Root Directory apps/web + default .next.
 */
import { readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const PROJECT_ID = 'prj_91LH9zPHQ7hPnt44AR15SeapkMVF';
const TEAM_ID = 'team_mMBSb5xkilgZxBnbtSDWFeEf';

function findToken() {
  const candidates = [
    join(process.env['APPDATA'] ?? '', 'xdg.data', 'com.vercel.cli', 'auth.json'),
    join(homedir(), '.vercel', 'auth.json'),
    join(process.env['APPDATA'] ?? '', 'com.vercel.cli', 'auth.json'),
  ];
  for (const path of candidates) {
    if (!existsSync(path)) continue;
    const raw = JSON.parse(readFileSync(path, 'utf8'));
    if (typeof raw.token === 'string') return raw.token;
  }
  if (process.env['VERCEL_TOKEN']) return process.env['VERCEL_TOKEN'];
  throw new Error('No Vercel token — run vercel login or set VERCEL_TOKEN');
}

const res = await fetch(
  `https://api.vercel.com/v9/projects/${PROJECT_ID}?teamId=${TEAM_ID}`,
  {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${findToken()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      rootDirectory: 'apps/web',
      buildCommand: 'cd ../.. && pnpm turbo run build --filter=@sniffoutpro/web',
      installCommand: 'cd ../.. && pnpm install',
      outputDirectory: null,
      framework: 'nextjs',
    }),
  },
);

if (!res.ok) {
  console.error('PATCH failed', res.status, await res.text());
  process.exit(1);
}

const data = await res.json();
console.log('ok', data.name, 'root=', data.rootDirectory);
