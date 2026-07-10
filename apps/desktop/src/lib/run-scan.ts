import {
  correlateCves,
  hostsToServiceContexts,
  LOG4J_CVE_FIXTURE,
  parseNmapXml,
  validateScanScope,
} from '@sniffoutpro/scan-engine';
import {
  eq,
  sqliteAuthorizationScopes,
  sqliteFindings,
  sqliteHosts,
  sqliteScanRuns,
  sqliteServices,
} from '@sniffoutpro/db';
import { createLocalDb } from './local-db';
import type { Finding, Host, ScanIntensity, ScanProvenance, ScanRun } from '@sniffoutpro/types';
import { invoke } from '@tauri-apps/api/core';
import { BaseDirectory, readFile, writeFile } from '@tauri-apps/plugin-fs';

const DB_FILE = 'sniffoutpro-tier1.db';

export type RunScanInput = {
  targets: string;
  intensity: ScanIntensity;
  consentText: string;
  useFixture?: boolean;
  /** Explicit opt-in to fall back to lab fixture when live nmap fails. */
  allowFixtureFallback?: boolean;
  /** Lab/dev: allow RFC1918 / loopback targets. */
  allowPrivateOverride?: boolean;
};

export type RunScanProgress = {
  percent: number;
  message: string;
};

async function loadDbBytes(): Promise<Uint8Array | undefined> {
  try {
    return await readFile(DB_FILE, { baseDir: BaseDirectory.AppData });
  } catch {
    return undefined;
  }
}

async function saveDbBytes(bytes: Uint8Array): Promise<void> {
  await writeFile(DB_FILE, bytes, { baseDir: BaseDirectory.AppData });
}

export async function runDesktopScan(
  input: RunScanInput,
  onProgress?: (p: RunScanProgress) => void,
): Promise<ScanRun> {
  onProgress?.({ percent: 5, message: 'Initializing local database…' });
  const db = await createLocalDb(await loadDbBytes());
  db.migrate();

  const scope = validateScanScope(input.targets, {
    allowPrivateOverride: input.allowPrivateOverride === true || input.useFixture === true,
    allowReservedOverride: false,
  });
  if (scope.isErr()) {
    db.close();
    throw new Error(scope.error.message);
  }

  const scopeId = crypto.randomUUID();
  const scanId = crypto.randomUUID();
  const startedAt = new Date().toISOString();
  const targetList = scope.value.targets;

  db.insert(sqliteAuthorizationScopes)
    .values({
      id: scopeId,
      targets: targetList,
      consentText: input.consentText,
      consentedAt: startedAt,
      createdAt: startedAt,
    })
    .run();

  db.insert(sqliteScanRuns)
    .values({
      id: scanId,
      authorizationScopeId: scopeId,
      status: 'running',
      targets: targetList,
      intensity: input.intensity,
      startedAt,
    })
    .run();

  onProgress?.({ percent: 20, message: 'Running host discovery…' });

  let xml: string;
  let source: ScanProvenance;

  if (input.useFixture === true) {
    xml = await invoke<string>('get_fixture_nmap_xml');
    source = 'fixture';
  } else {
    try {
      const result = await invoke<{ xml: string; exit_code: number }>('run_nmap', {
        targets: targetList.join(' '),
        intensity: input.intensity,
      });
      xml = result.xml;
      source = 'live';
    } catch (nmapError) {
      if (input.allowFixtureFallback === true) {
        xml = await invoke<string>('get_fixture_nmap_xml');
        source = 'fixture';
        onProgress?.({
          percent: 25,
          message: 'nmap unavailable — using lab fixture (explicit fallback)',
        });
      } else {
        const message = nmapError instanceof Error ? nmapError.message : 'nmap scan failed';
        db.update(sqliteScanRuns)
          .set({ status: 'failed', completedAt: new Date().toISOString() })
          .where(eq(sqliteScanRuns.id, scanId))
          .run();
        await saveDbBytes(db.exportBytes());
        db.close();
        throw new Error(`${message}. Enable "Allow fixture fallback" or use lab fixture mode.`);
      }
    }
  }

  onProgress?.({ percent: 50, message: 'Parsing scan output…' });
  const parsed = parseNmapXml(xml);
  if (parsed.isErr()) {
    db.update(sqliteScanRuns)
      .set({ status: 'failed', completedAt: new Date().toISOString() })
      .where(eq(sqliteScanRuns.id, scanId))
      .run();
    await saveDbBytes(db.exportBytes());
    db.close();
    throw new Error(parsed.error.message);
  }

  const hosts: Host[] = parsed.value;
  onProgress?.({ percent: 70, message: 'Correlating CVEs…' });
  const contexts = hostsToServiceContexts(hosts);
  const correlated = correlateCves(contexts, LOG4J_CVE_FIXTURE);
  const findings: Finding[] = correlated.isOk() ? correlated.value : [];

  for (const host of hosts) {
    const hostId = crypto.randomUUID();
    db.insert(sqliteHosts)
      .values({
        id: hostId,
        scanRunId: scanId,
        ip: host.ip,
        hostname: host.hostname ?? null,
        mac: host.mac ?? null,
        os: host.os ?? null,
        osConfidence: host.osConfidence ?? null,
      })
      .run();

    for (const svc of host.services) {
      db.insert(sqliteServices)
        .values({
          id: crypto.randomUUID(),
          hostId,
          port: svc.port,
          protocol: svc.protocol,
          product: svc.product ?? null,
          version: svc.version ?? null,
          banner: svc.banner ?? null,
        })
        .run();
    }
  }

  for (const finding of findings) {
    db.insert(sqliteFindings)
      .values({
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
        port: finding.port ?? null,
      })
      .run();
  }

  const completedAt = new Date().toISOString();
  const scanRun: ScanRun = {
    id: scanId,
    status: 'completed',
    targets: targetList,
    intensity: input.intensity,
    startedAt,
    completedAt,
    hosts,
    findings,
    source,
  };

  db.update(sqliteScanRuns)
    .set({
      status: 'completed',
      completedAt,
      rawOutput: xml,
      normalizedOutput: JSON.stringify({ hosts, findings, source }),
    })
    .where(eq(sqliteScanRuns.id, scanId))
    .run();

  await saveDbBytes(db.exportBytes());
  onProgress?.({
    percent: 100,
    message: source === 'fixture' ? 'Scan complete (lab fixture)' : 'Scan complete',
  });
  db.close();
  return scanRun;
}
