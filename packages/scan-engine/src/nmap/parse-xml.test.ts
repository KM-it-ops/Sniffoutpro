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

  it('returns PARSE_FAILED with the parser error as cause when output stops mid-tag', () => {
    const result = parseNmapXml('<nmaprun><host><status state="up');
    expect(result.isErr()).toBe(true);
    if (!result.isErr()) return;
    expect(result.error.code).toBe('PARSE_FAILED');
    expect(result.error.message).toBe('Failed to parse nmap XML output');
    expect(result.error.cause).toBeDefined();
  });

  it('keeps only open ports with a numeric port id', () => {
    const result = parseNmapXml(`<nmaprun>
      <host>
        <status state="up"/>
        <address addr="203.0.113.5" addrtype="ipv4"/>
        <ports>
          <port protocol="tcp" portid="22"><state state="closed"/></port>
          <port protocol="tcp" portid="25"><state state="filtered"/></port>
          <port protocol="tcp"><state state="open"/></port>
          <port protocol="tcp" portid="abc"><state state="open"/></port>
          <port protocol="udp" portid="53"><state state="open"/><service name="domain"/></port>
        </ports>
      </host>
    </nmaprun>`);
    expect(result.isOk()).toBe(true);
    if (!result.isOk()) return;
    expect(result.value).toHaveLength(1);
    expect(result.value[0]?.services).toEqual([{ port: 53, protocol: 'udp', product: 'domain' }]);
  });

  it('prefers product over service name and stores extrainfo as banner only when non-empty', () => {
    const result = parseNmapXml(`<nmaprun>
      <host>
        <status state="up"/>
        <address addr="203.0.113.5" addrtype="ipv4"/>
        <ports>
          <port protocol="tcp" portid="80">
            <state state="open"/>
            <service name="http" product="nginx" version="1.18.0" extrainfo="Ubuntu"/>
          </port>
          <port protocol="tcp" portid="8443">
            <state state="open"/>
            <service name="https-alt" extrainfo=""/>
          </port>
          <port protocol="tcp" portid="9000"><state state="open"/></port>
        </ports>
      </host>
    </nmaprun>`);
    expect(result.isOk()).toBe(true);
    if (!result.isOk()) return;
    expect(result.value[0]?.services).toEqual([
      { port: 80, protocol: 'tcp', product: 'nginx', version: '1.18.0', banner: 'Ubuntu' },
      { port: 8443, protocol: 'tcp', product: 'https-alt' },
      { port: 9000, protocol: 'tcp' },
    ]);
  });

  it('drops hosts that are down or have no IP address', () => {
    const result = parseNmapXml(`<nmaprun>
      <host>
        <status state="down"/>
        <address addr="203.0.113.1" addrtype="ipv4"/>
      </host>
      <host>
        <status state="up"/>
        <address addr="AA:BB:CC:DD:EE:01" addrtype="mac"/>
      </host>
      <host>
        <status state="up"/>
        <address addr="2001:db8::1" addrtype="ipv6"/>
      </host>
    </nmaprun>`);
    expect(result.isOk()).toBe(true);
    if (!result.isOk()) return;
    expect(result.value).toEqual([{ ip: '2001:db8::1', services: [] }]);
  });

  it('reads MAC address and OS accuracy from the fixture', () => {
    const xml = readFileSync(join(fixturesDir, 'nmap-sample.xml'), 'utf8');
    const result = parseNmapXml(xml);
    expect(result.isOk()).toBe(true);
    if (!result.isOk()) return;
    expect(result.value[0]?.osConfidence).toBe(95);
    expect(result.value[1]?.mac).toBe('AA:BB:CC:DD:EE:FF');
    expect(result.value[1]?.hostname).toBeUndefined();
  });
});
