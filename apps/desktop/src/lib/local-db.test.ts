import { Buffer } from 'buffer';
import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { sqliteScanRuns } from '@sniffoutpro/db';
import { createLocalDb } from './local-db';

if (typeof globalThis.Buffer === 'undefined') {
  (globalThis as typeof globalThis & { Buffer: typeof Buffer }).Buffer = Buffer;
}

describe('local-db (sql.js)', () => {
  it('migrates, persists scan runs, and round-trips export bytes', async () => {
    const db = await createLocalDb();
    db.migrate();

    const scanId = crypto.randomUUID();
    const scopeId = crypto.randomUUID();
    const startedAt = new Date().toISOString();

    db.insert(sqliteScanRuns).values({
      id: scanId,
      authorizationScopeId: scopeId,
      status: 'completed',
      targets: ['127.0.0.1'],
      intensity: 'light',
      startedAt,
      completedAt: startedAt,
    }).run();

    const rows = db.listScanRuns();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(scanId);

    const bytes = db.exportBytes();
    db.close();

    const reloaded = await createLocalDb(bytes);
    reloaded.migrate();
    const persisted = reloaded
      .select()
      .from(sqliteScanRuns)
      .where(eq(sqliteScanRuns.id, scanId))
      .all();
    expect(persisted).toHaveLength(1);
    expect(persisted[0]?.status).toBe('completed');
    reloaded.close();
  });
});
