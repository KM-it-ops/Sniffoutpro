import { describe, expect, it } from 'vitest';
import { correlateCves } from '../cve/correlate.js';
import { LOG4J_CVE_FIXTURE } from './log4j.js';

describe('LOG4J_CVE_FIXTURE', () => {
  it('flags the fixture Log4j service once per CVE', () => {
    const result = correlateCves(
      [
        {
          host: { ip: '127.0.0.1', services: [] },
          port: 8080,
          protocol: 'tcp',
          product: 'Apache Log4j',
          version: '2.14.1',
        },
      ],
      LOG4J_CVE_FIXTURE,
    );
    expect(result.isOk()).toBe(true);
    if (!result.isOk()) return;
    expect(result.value.map((f) => [f.cveId, f.severity])).toEqual([
      ['CVE-2021-44228', 'critical'],
      ['CVE-2021-45046', 'critical'],
    ]);
  });

  it('does not flag a patched Log4j release', () => {
    const result = correlateCves(
      [
        {
          host: { ip: '127.0.0.1', services: [] },
          port: 8080,
          protocol: 'tcp',
          product: 'Apache Log4j',
          version: '2.17.1',
        },
      ],
      LOG4J_CVE_FIXTURE,
    );
    expect(result.isOk()).toBe(true);
    if (!result.isOk()) return;
    expect(result.value).toEqual([]);
  });
});
