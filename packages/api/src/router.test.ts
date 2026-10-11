import { sql } from 'drizzle-orm';
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { createDb } from '@sniffoutpro/db';
import { users } from '@sniffoutpro/db/schema';
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

  it('scans.list returns array when database is available', async (ctx) => {
    if (!dbAvailable) {
      ctx.skip();
      return;
    }
    const caller = createCaller({
      db,
      logger,
      userId: '44444444-4444-4444-8444-444444444444',
      tier: 'PERSONAL',
      syncAuthorized: false,
    });
    const result = await caller.scans.list();
    expect(Array.isArray(result)).toBe(true);
  });

  it('scans.sync persists a scan run when database is available', async (ctx) => {
    if (!dbAvailable) {
      ctx.skip();
      return;
    }
    const userId = '44444444-4444-4444-8444-444444444444';
    await db
      .insert(users)
      .values({ id: userId, email: 'router-test@example.com' })
      .onConflictDoNothing();
    const caller = createCaller({
      db,
      logger,
      userId,
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
    const listed = await caller.scans.list();
    expect(listed.some((row) => row.id === scanId)).toBe(true);

    const other = createCaller({
      db,
      logger,
      userId: '55555555-5555-4555-8555-555555555555',
      tier: 'WORKSTATION',
      syncAuthorized: false,
    });
    const hidden = await other.scans.list();
    expect(hidden.some((row) => row.id === scanId)).toBe(false);
    // Row security hides another account's scan entirely, so it reads as missing.
    await expect(other.scans.getDetail({ id: scanId })).resolves.toBeNull();
  });
});
