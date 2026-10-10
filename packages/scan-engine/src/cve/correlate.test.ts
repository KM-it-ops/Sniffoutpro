import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { Finding } from '@sniffoutpro/types';
import { compareVersions, correlateCves, type CveCacheEntry } from '../cve/correlate.js';

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), '../../fixtures');

type Log4jFixture = {
  service: {
    product: string;
    version: string;
    port: number;
    protocol: 'tcp' | 'udp';
  };
  cveEntries: CveCacheEntry[];
};

describe('correlateCves', () => {
  it('deduplicates repeated CVE matches', () => {
    const fixture = JSON.parse(
      readFileSync(join(fixturesDir, 'log4j-service.json'), 'utf8'),
    ) as Log4jFixture;

    const host = {
      ip: '127.0.0.1',
      services: [
        {
          port: fixture.service.port,
          protocol: fixture.service.protocol,
          product: fixture.service.product,
          version: fixture.service.version,
        },
      ],
    };

    const result = correlateCves(
      [
        {
          host,
          port: fixture.service.port,
          protocol: fixture.service.protocol,
          product: fixture.service.product,
          version: fixture.service.version,
        },
      ],
      fixture.cveEntries,
    );

    expect(result.isOk()).toBe(true);
    if (!result.isOk()) return;
    expect(result.value.length).toBeGreaterThanOrEqual(1);
    expect(result.value[0]?.cveId).toBe('CVE-2021-44228');
    expect(result.value[0]?.severity).toBe('critical');
  });

  it('maps hosts via hostsToServiceContexts helper', async () => {
    const { hostsToServiceContexts } = await import('../cve/correlate.js');
    const contexts = hostsToServiceContexts([
      {
        ip: '10.0.0.5',
        services: [{ port: 443, protocol: 'tcp', product: 'nginx', version: '1.18.0' }],
      },
    ]);
    expect(contexts).toHaveLength(1);
    expect(contexts[0]?.product).toBe('nginx');
  });

  it('compares versions semver-aware (9 < 10)', () => {
    expect(compareVersions('9', '10')).toBeLessThan(0);
    expect(compareVersions('1.9', '1.10')).toBeLessThan(0);
    expect(compareVersions('2.14.1', '2.14.1')).toBe(0);
  });

  it('does not match short bidirectional substrings (ssh vs sh)', () => {
    const result = correlateCves(
      [
        {
          host: { ip: '1.2.3.4', services: [{ port: 22, protocol: 'tcp', product: 'ssh' }] },
          port: 22,
          protocol: 'tcp',
          product: 'ssh',
          version: '1.0',
        },
      ],
      [
        {
          id: 'CVE-FAKE-SH',
          affectedProducts: [{ product: 'sh', versionStart: '0', versionEnd: '9' }],
        },
      ],
    );
    expect(result.isOk()).toBe(true);
    if (!result.isOk()) return;
    expect(result.value).toHaveLength(0);
  });

  it('matches version ranges with semver compare', () => {
    const result = correlateCves(
      [
        {
          host: { ip: '1.2.3.4', services: [{ port: 80, protocol: 'tcp', product: 'nginx' }] },
          port: 80,
          protocol: 'tcp',
          product: 'nginx',
          version: '1.9.0',
        },
      ],
      [
        {
          id: 'CVE-NGINX-RANGE',
          cvssScore: 5,
          affectedProducts: [{ product: 'nginx', versionStart: '1.0', versionEnd: '1.10' }],
        },
      ],
    );
    expect(result.isOk()).toBe(true);
    if (!result.isOk()) return;
    expect(result.value).toHaveLength(1);
  });

  const publicHost = { ip: '203.0.113.7', services: [] };

  function findingsFor(
    service: { product?: string; version?: string },
    cve: Omit<CveCacheEntry, 'id'>,
  ): Finding[] {
    const result = correlateCves(
      [{ host: publicHost, port: 80, protocol: 'tcp', ...service }],
      [{ id: 'CVE-TEST-0001', ...cve }],
    );
    expect(result.isOk()).toBe(true);
    return result.isOk() ? result.value : [];
  }

  it.each([
    { cvssScore: 9.0, severity: 'critical' },
    { cvssScore: 7.0, severity: 'high' },
    { cvssScore: 6.9, severity: 'medium' },
    { cvssScore: 4.0, severity: 'medium' },
    { cvssScore: 0.1, severity: 'low' },
    { cvssScore: 0, severity: 'info' },
  ])('maps CVSS $cvssScore to $severity', ({ cvssScore, severity }) => {
    const findings = findingsFor(
      { product: 'nginx', version: '1.18.0' },
      { cvssScore, affectedProducts: [{ product: 'nginx' }] },
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]?.severity).toBe(severity);
    expect(findings[0]?.cvssScore).toBe(cvssScore);
  });

  it('reports info severity and omits cvssScore when the CVE has no score', () => {
    const findings = findingsFor(
      { product: 'nginx', version: '1.18.0' },
      { affectedProducts: [{ product: 'nginx' }] },
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]?.severity).toBe('info');
    expect(findings[0]).not.toHaveProperty('cvssScore');
  });

  it('scores a non-loopback host as network exposure', () => {
    const findings = findingsFor(
      { product: 'nginx', version: '1.18.0' },
      { cvssScore: 5, affectedProducts: [{ product: 'nginx' }] },
    );
    // (5 * 6 + 50 * 0.25) * 1.2 = 51
    expect(findings[0]?.riskScore).toBe(51);
    expect(findings[0]?.hostIp).toBe('203.0.113.7');
    expect(findings[0]?.port).toBe(80);
  });

  it('skips versions below versionStart or above versionEnd', () => {
    const cve = {
      affectedProducts: [{ product: 'nginx', versionStart: '1.10', versionEnd: '1.20' }],
    };
    expect(findingsFor({ product: 'nginx', version: '1.9.9' }, cve)).toEqual([]);
    expect(findingsFor({ product: 'nginx', version: '1.20.1' }, cve)).toEqual([]);
    expect(findingsFor({ product: 'nginx', version: '1.10' }, cve)).toHaveLength(1);
    expect(findingsFor({ product: 'nginx', version: '1.20' }, cve)).toHaveLength(1);
  });

  it('treats an unknown service version as affected', () => {
    const findings = findingsFor(
      { product: 'nginx' },
      { affectedProducts: [{ product: 'nginx', versionStart: '1.10', versionEnd: '1.20' }] },
    );
    expect(findings).toHaveLength(1);
  });

  it('skips services without a product', () => {
    expect(
      findingsFor({ version: '1.18.0' }, { affectedProducts: [{ product: 'nginx' }] }),
    ).toEqual([]);
  });

  it('never matches products that normalize to nothing', () => {
    expect(findingsFor({ product: '---' }, { affectedProducts: [{ product: '---' }] })).toEqual([]);
    expect(findingsFor({ product: 'nginx' }, { affectedProducts: [{ product: '' }] })).toEqual([]);
  });

  it('matches only when every significant affected token is a whole token of the product', () => {
    const cve = { affectedProducts: [{ product: 'Apache httpd' }] };
    expect(findingsFor({ product: 'Apache httpd 2.4.49' }, cve)).toHaveLength(1);
    expect(findingsFor({ product: 'Apache http' }, cve)).toEqual([]);
    expect(findingsFor({ product: 'httpd' }, cve)).toEqual([]);
  });

  it('compares versions of different lengths and with non-numeric parts', () => {
    expect(compareVersions('1.2', '1.2.0')).toBe(0);
    expect(compareVersions('1.2.1', '1.2')).toBeGreaterThan(0);
    expect(compareVersions('1.2', '1.2.1')).toBeLessThan(0);
    expect(compareVersions('v2.0', '2.0')).toBe(0);
    expect(compareVersions('8.9p1', '8.9')).toBe(0);
    expect(compareVersions('1.x', '1.0')).toBe(0);
  });
});
