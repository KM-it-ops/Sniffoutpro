import initSqlJs from 'sql.js/dist/sql-wasm.js';
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url';
import type { Database as SqlJsDatabase } from 'sql.js';
import { drizzle, type SQLJsDatabase } from 'drizzle-orm/sql-js';
import { desc } from 'drizzle-orm';
import { sqliteSchema } from '@sniffoutpro/db';

const { sqliteScanRuns } = sqliteSchema;

export type LocalDatabase = SQLJsDatabase<typeof sqliteSchema> & {
  migrate: () => void;
  listScanRuns: () => Array<typeof sqliteScanRuns.$inferSelect>;
  exportBytes: () => Uint8Array;
  close: () => void;
};

const MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS authorization_scopes (
  id TEXT PRIMARY KEY,
  targets TEXT NOT NULL,
  consent_text TEXT NOT NULL,
  consented_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS scan_runs (
  id TEXT PRIMARY KEY,
  authorization_scope_id TEXT NOT NULL,
  status TEXT NOT NULL,
  targets TEXT NOT NULL,
  intensity TEXT NOT NULL,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  raw_output TEXT,
  normalized_output TEXT
);
CREATE TABLE IF NOT EXISTS hosts (
  id TEXT PRIMARY KEY,
  scan_run_id TEXT NOT NULL,
  ip TEXT NOT NULL,
  hostname TEXT,
  mac TEXT,
  os TEXT,
  os_confidence REAL
);
CREATE TABLE IF NOT EXISTS services (
  id TEXT PRIMARY KEY,
  host_id TEXT NOT NULL,
  port INTEGER NOT NULL,
  protocol TEXT NOT NULL,
  product TEXT,
  version TEXT,
  banner TEXT
);
CREATE TABLE IF NOT EXISTS findings (
  id TEXT PRIMARY KEY,
  scan_run_id TEXT NOT NULL,
  host_id TEXT,
  service_id TEXT,
  cve_id TEXT,
  title TEXT NOT NULL,
  severity TEXT NOT NULL,
  cvss_score REAL,
  risk_score REAL NOT NULL,
  description TEXT
);
`;

async function getWasmLocateFile(): Promise<(file: string) => string> {
  if (typeof window === 'undefined') {
    const { createRequire } = await import('node:module');
    const path = await import('node:path');
    const require = createRequire(import.meta.url);
    const sqlJsDir = path.dirname(require.resolve('sql.js/dist/sql-wasm.js'));
    return (file) => path.join(sqlJsDir, file);
  }
  return () => wasmUrl;
}

export async function createLocalDb(existingBytes?: Uint8Array): Promise<LocalDatabase> {
  const locateFile = await getWasmLocateFile();
  const SQL = await initSqlJs({ locateFile });

  const sqlDb: SqlJsDatabase = existingBytes ? new SQL.Database(existingBytes) : new SQL.Database();
  const db = drizzle(sqlDb, { schema: sqliteSchema });

  return Object.assign(db, {
    migrate: (): void => {
      sqlDb.run(MIGRATION_SQL);
    },
    listScanRuns: (): Array<typeof sqliteScanRuns.$inferSelect> => {
      return db.select().from(sqliteScanRuns).orderBy(desc(sqliteScanRuns.startedAt)).all();
    },
    exportBytes: (): Uint8Array => sqlDb.export(),
    close: (): void => {
      sqlDb.close();
    },
  });
}
