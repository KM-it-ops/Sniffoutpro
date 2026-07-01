import { sql } from 'drizzle-orm';
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { createDb } from '@sniffoutpro/db';
import { appRouter } from './router.js';
import { createCallerFactory } from './trpc.js';
import { createLogger } from './logger.js';

const DATABASE_URL =
  process.env['DATABASE_URL'] ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

const createCaller = createCallerFactory(appRouter);

describe('tRPC api', () => {
  let db: ReturnType<typeof createDb>;
  let dbAvailable = false;
  const logger = createLogger('test');

  beforeAll(async () => {
    db = createDb(DATABASE_URL);
    try {
      await db.execute(sql`select 1`);
      dbAvailable = true;
    } catch {
      dbAvailable = false;
    }
  });

  afterAll(async () => {
    await db.close();
  });

  it('health.ping returns ok', async () => {
    const caller = createCaller({
      db,
      logger,
      userId: null,
      tier: 'PERSONAL',
      syncAuthorized: true,
    });
    const result = await caller.health.ping();
    expect(result.status).toBe('ok');
    expect(result.service).toBe('sniffoutpro-api');
  });

  it('scans.list returns array when database is available', async () => {
    if (!dbAvailable) {
      console.warn('Skipping scans.list integration test — Postgres not reachable');
      return;
    }
    const caller = createCaller({
      db,
      logger,
      userId: null,
      tier: 'PERSONAL',
      syncAuthorized: true,
    });
    const result = await caller.scans.list();
    expect(Array.isArray(result)).toBe(true);
  });

  it('scans.sync persists a scan run when database is available', async () => {
    if (!dbAvailable) {
      console.warn('Skipping scans.sync integration test — Postgres not reachable');
      return;
    }
    const caller = createCaller({
      db,
      logger,
      userId: null,
      tier: 'WORKSTATION',
      syncAuthorized: true,
    });

    const scanId = crypto.randomUUID();
    const findingId = crypto.randomUUID();
    const result = await caller.scans.sync({
      consentText: 'Test authorization',
      scanRun: {
        id: scanId,
        status: 'completed',
        targets: ['127.0.0.1'],
        intensity: 'light',
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        hosts: [
          {
            ip: '127.0.0.1',
            services: [{ port: 22, protocol: 'tcp', product: 'OpenSSH' }],
          },
        ],
        findings: [
          {
            id: findingId,
            title: 'Test finding',
            severity: 'info',
            riskScore: 10,
            hostIp: '127.0.0.1',
            port: 22,
          },
        ],
      },
    });

    expect(result.ok).toBe(true);
    const detail = await caller.scans.getDetail({ id: scanId });
    expect(detail?.scan.hosts).toHaveLength(1);
    expect(detail?.scan.findings).toHaveLength(1);
  });
});
