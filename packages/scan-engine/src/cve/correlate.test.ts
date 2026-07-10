import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
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
});
