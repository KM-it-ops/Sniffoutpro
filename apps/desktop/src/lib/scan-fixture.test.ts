import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { correlateCves, hostsToServiceContexts, LOG4J_CVE_FIXTURE, parseNmapXml } from '@sniffoutpro/scan-engine';

const fixturePath = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../packages/scan-engine/fixtures/nmap-sample.xml',
);

describe('desktop scan fixture pipeline', () => {
  it('parses nmap fixture with at least 3 topology nodes worth of hosts', () => {
    const xml = readFileSync(fixturePath, 'utf8');
    const hosts = parseNmapXml(xml);
    expect(hosts.isOk()).toBe(true);
    if (!hosts.isOk()) return;
    expect(hosts.value.length).toBeGreaterThanOrEqual(3);
  });

  it('correlates log4j findings from fixture hosts', () => {
    const xml = readFileSync(fixturePath, 'utf8');
    const hosts = parseNmapXml(xml);
    if (!hosts.isOk()) throw new Error('parse failed');
    const findings = correlateCves(hostsToServiceContexts(hosts.value), LOG4J_CVE_FIXTURE);
    expect(findings.isOk()).toBe(true);
    if (!findings.isOk()) return;
    expect(findings.value.length).toBeGreaterThanOrEqual(1);
  });
});
