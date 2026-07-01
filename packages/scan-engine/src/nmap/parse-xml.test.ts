import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseNmapXml } from '../nmap/parse-xml.js';

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), '../../fixtures');

describe('parseNmapXml', () => {
  it('parses fixture with multiple hosts and services', () => {
    const xml = readFileSync(join(fixturesDir, 'nmap-sample.xml'), 'utf8');
    const result = parseNmapXml(xml);
    expect(result.isOk()).toBe(true);
    if (!result.isOk()) return;

    const hosts = result.value;
    expect(hosts.length).toBeGreaterThanOrEqual(3);
    expect(hosts[0]?.ip).toBe('127.0.0.1');
    expect(hosts[0]?.services.length).toBeGreaterThanOrEqual(1);
    expect(hosts[0]?.hostname).toBe('localhost');
    expect(hosts[0]?.os).toContain('Linux');
  });

  it('returns error for invalid XML', () => {
    const result = parseNmapXml('not xml');
    expect(result.isErr()).toBe(true);
  });
});
