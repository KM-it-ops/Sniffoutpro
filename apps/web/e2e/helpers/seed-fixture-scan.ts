import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createDb } from '@sniffoutpro/db';
import { appRouter, createCallerFactory, createLogger } from '@sniffoutpro/api';
import {
  correlateCves,
  hostsToServiceContexts,
  LOG4J_CVE_FIXTURE,
  parseNmapXml,
} from '@sniffoutpro/scan-engine';

const DATABASE_URL =
  process.env['DATABASE_URL'] ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

const fixturePath = join(
  process.cwd(),
  '../../packages/scan-engine/fixtures/nmap-sample.xml',
);

export async function seedFixtureScan(): Promise<string> {
  const db = createDb(DATABASE_URL);

  const xml = readFileSync(fixturePath, 'utf8');
  const parsed = parseNmapXml(xml);
  if (parsed.isErr()) {
    await db.close();
    throw new Error(parsed.error.message);
  }

  const findings = correlateCves(hostsToServiceContexts(parsed.value), LOG4J_CVE_FIXTURE);
  if (!findings.isOk()) {
    await db.close();
    throw new Error('CVE correlation failed');
  }

  const scanId = crypto.randomUUID();
  const startedAt = new Date().toISOString();
  const createCaller = createCallerFactory(appRouter);
  const caller = createCaller({
    db,
    logger: createLogger('e2e-seed'),
    userId: null,
    tier: 'WORKSTATION',
    syncAuthorized: true,
  });

  await caller.scans.sync({
    consentText: 'Playwright E2E lab authorization',
    scanRun: {
      id: scanId,
      status: 'completed',
      targets: ['127.0.0.1'],
      intensity: 'standard',
      startedAt,
      completedAt: startedAt,
      hosts: parsed.value,
      findings: findings.value,
    },
    rawOutput: xml,
  });

  await db.close();
  return scanId;
}
