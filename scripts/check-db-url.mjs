import { readFileSync, existsSync } from 'node:fs';

const paths = ['.vercel/.env.production.local', '.local/prod.env'];
for (const path of paths) {
  if (!existsSync(path)) continue;
  const line = readFileSync(path, 'utf8').split('\n').find((l) => l.startsWith('DATABASE_URL='));
  if (!line) continue;
  const value = line.slice('DATABASE_URL='.length).replace(/^"|"$/g, '');
  if (!value) {
    console.log(`${path}: DATABASE_URL empty`);
  } else if (value.includes('127.0.0.1') || value.includes('localhost')) {
    console.log(`${path}: DATABASE_URL is localhost`);
  } else if (value.includes('supabase')) {
    console.log(`${path}: DATABASE_URL is supabase`);
  } else {
    console.log(`${path}: DATABASE_URL is hosted`);
  }
}
