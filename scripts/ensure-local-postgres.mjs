import { spawnSync } from 'node:child_process';
import { createConnection } from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const databaseUrl = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const composeFile = join(root, 'docker', 'docker-compose.dev.yml');

function portOpen(port) {
  return new Promise((resolve) => {
    const socket = createConnection({ host: '127.0.0.1', port, timeout: 1000 });
    const finish = (open) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(open);
    };
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
    socket.once('timeout', () => finish(false));
  });
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

if (!(await portOpen(54322))) {
  const started = spawnSync(
    'docker',
    ['compose', '-f', composeFile, 'up', '-d', '--wait'],
    { cwd: root, stdio: 'inherit' },
  );
  if (started.error || started.status !== 0) {
    fail(
      'The local database did not start. Install Docker and run pnpm local again, or follow the Supabase steps in docs/USER-GUIDE.md for several people. The desktop scanner does not need this database.',
    );
  }
}

const migrateCommand = 'pnpm --filter @sniffoutpro/db db:migrate';
const migrated =
  process.platform === 'win32'
    ? spawnSync(process.env['ComSpec'] ?? 'cmd.exe', ['/d', '/s', '/c', migrateCommand], {
        cwd: root,
        stdio: 'inherit',
        env: { ...process.env, DATABASE_URL: databaseUrl },
      })
    : spawnSync('pnpm', ['--filter', '@sniffoutpro/db', 'db:migrate'], {
        cwd: root,
        stdio: 'inherit',
        env: { ...process.env, DATABASE_URL: databaseUrl },
      });
if (migrated.error || migrated.status !== 0) {
  fail('The local database started, but the migrations did not apply.');
}

console.log('Local database is ready. No account is required for the desktop scanner.');
