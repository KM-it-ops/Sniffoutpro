import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { correlateCves, type CveCacheEntry } from '../cve/correlate.js';

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
});
