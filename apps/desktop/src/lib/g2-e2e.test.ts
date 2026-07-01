import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Buffer } from 'buffer';
import { describe, expect, it } from 'vitest';
import {
  correlateCves,
  hostsToServiceContexts,
  LOG4J_CVE_FIXTURE,
  parseNmapXml,
} from '@sniffoutpro/scan-engine';
import {
  eq,
  sqliteFindings,
  sqliteHosts,
  sqliteScanRuns,
} from '@sniffoutpro/db';
import { createLocalDb } from './local-db';

if (typeof globalThis.Buffer === 'undefined') {
  (globalThis as typeof globalThis & { Buffer: typeof Buffer }).Buffer = Buffer;
}

const fixturePath = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../packages/scan-engine/fixtures/nmap-sample.xml',
);

describe('G2 fixture scan E2E (parse → correlate → SQLite)', () => {
  it('produces 3 hosts, Log4j CVE finding, and persists to tier-1 SQLite', async () => {
    const xml = readFileSync(fixturePath, 'utf8');
    const parsed = parseNmapXml(xml);
    expect(parsed.isOk()).toBe(true);
    if (!parsed.isOk()) return;

    const hosts = parsed.value;
    expect(hosts.length).toBeGreaterThanOrEqual(3);

    const findings = correlateCves(hostsToServiceContexts(hosts), LOG4J_CVE_FIXTURE);
    expect(findings.isOk()).toBe(true);
    if (!findings.isOk()) return;
    expect(findings.value.some((f) => f.cveId === 'CVE-2021-44228')).toBe(true);

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
      rawOutput: xml,
      normalizedOutput: JSON.stringify({ hosts, findings: findings.value }),
    }).run();

    for (const host of hosts) {
      const hostId = crypto.randomUUID();
      db.insert(sqliteHosts).values({
        id: hostId,
        scanRunId: scanId,
        ip: host.ip,
        hostname: host.hostname ?? null,
        mac: host.mac ?? null,
        os: host.os ?? null,
        osConfidence: host.osConfidence ?? null,
      }).run();
    }

    for (const finding of findings.value) {
      db.insert(sqliteFindings).values({
        id: finding.id,
        scanRunId: scanId,
        hostId: null,
        serviceId: null,
        cveId: finding.cveId ?? null,
        title: finding.title,
        severity: finding.severity,
        cvssScore: finding.cvssScore ?? null,
        riskScore: finding.riskScore,
        description: finding.description ?? null,
      }).run();
    }

    const hostRows = db.select().from(sqliteHosts).where(eq(sqliteHosts.scanRunId, scanId)).all();
    const findingRows = db
      .select()
      .from(sqliteFindings)
      .where(eq(sqliteFindings.scanRunId, scanId))
      .all();

    expect(hostRows.length).toBeGreaterThanOrEqual(3);
    expect(findingRows.some((f) => f.cveId === 'CVE-2021-44228')).toBe(true);

    const bytes = db.exportBytes();
    expect(bytes.byteLength).toBeGreaterThan(0);
    db.close();
  });
});
