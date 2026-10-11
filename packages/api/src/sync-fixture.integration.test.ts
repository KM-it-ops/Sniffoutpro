import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { createDb } from '@sniffoutpro/db';
import { memberships, organizations, users } from '@sniffoutpro/db/schema';
import {
  correlateCves,
  hostsToServiceContexts,
  LOG4J_CVE_FIXTURE,
  parseNmapXml,
} from '@sniffoutpro/scan-engine';
import type { ScanRun } from '@sniffoutpro/types';
import { appRouter } from './router.js';
import { createCallerFactory } from './trpc.js';
import { createLogger } from './logger.js';

const DATABASE_URL =
  process.env['DATABASE_URL'] ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

const fixturePath = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../scan-engine/fixtures/nmap-sample.xml',
);

const createCaller = createCallerFactory(appRouter);

function buildFixtureScanRun(): ScanRun {
  const xml = readFileSync(fixturePath, 'utf8');
  const parsed = parseNmapXml(xml);
  if (parsed.isErr()) {
    throw new Error(parsed.error.message);
  }
  const findings = correlateCves(hostsToServiceContexts(parsed.value), LOG4J_CVE_FIXTURE);
  if (!findings.isOk()) {
    throw new Error('CVE correlation failed');
  }

  const startedAt = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    status: 'completed',
    targets: ['127.0.0.1'],
    intensity: 'standard',
    startedAt,
    completedAt: startedAt,
    hosts: parsed.value,
    findings: findings.value,
    source: 'fixture',
  };
}

describe('fixture scan cloud sync', () => {
  let db: ReturnType<typeof createDb>;
  let dbAvailable = false;
  const logger = createLogger('fixture-sync-test');

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

  it('syncs lab fixture with 3 hosts and Log4j finding to Postgres', async (ctx) => {
    if (!dbAvailable) {
      // Report as skipped (not passed) so a missing local stack is visible in CI.
      ctx.skip();
    }

    const scanRun = buildFixtureScanRun();
    const userId = '55555555-5555-4555-8555-555555555555';
    const orgId = '55555555-5555-4555-8555-555555555556';
    await db
      .insert(users)
      .values({ id: userId, email: 'fixture-sync@example.com' })
      .onConflictDoNothing();
    await db
      .insert(organizations)
      .values({ id: orgId, name: 'Fixture lab', slug: 'fixture-lab' })
      .onConflictDoNothing();
    await db.insert(memberships).values({ orgId, userId, role: 'analyst' }).onConflictDoNothing();
    const caller = createCaller({
      db,
      logger,
      userId,
      tier: 'WORKSTATION',
      syncAuthorized: true,
    });

    const sync = await caller.scans.sync({
      consentText: 'Lab fixture authorization',
      scanRun,
      rawOutput: readFileSync(fixturePath, 'utf8'),
    });
    expect(sync.ok).toBe(true);

    const detail = await caller.scans.getDetail({ id: scanRun.id });
    expect(detail?.scan.hosts.length).toBeGreaterThanOrEqual(3);
    expect(detail?.scan.findings.some((f) => f.cveId === 'CVE-2021-44228')).toBe(true);
    // C3: fixture provenance must survive the cloud sync round-trip.
    expect(detail?.scan.source).toBe('fixture');

    const list = await caller.scans.list({ limit: 50 });
    expect(list.some((row) => row.id === scanRun.id)).toBe(true);
  });
});
