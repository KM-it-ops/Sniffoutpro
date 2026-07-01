import { XMLParser } from 'fast-xml-parser';
import { err, ok, type Result } from 'neverthrow';
import type { Host, Service } from '@sniffoutpro/types';
import { scanError, type ScanError } from '../errors.js';

type NmapAddress = {
  '@_addr'?: string;
  '@_addrtype'?: string;
};

type NmapPort = {
  '@_protocol'?: string;
  '@_portid'?: string;
  state?: { '@_state'?: string };
  service?: {
    '@_name'?: string;
    '@_product'?: string;
    '@_version'?: string;
  };
};

type NmapHost = {
  status?: { '@_state'?: string };
  address?: NmapAddress | NmapAddress[];
  hostnames?: { hostname?: { '@_name'?: string } | Array<{ '@_name'?: string }> };
  ports?: { port?: NmapPort | NmapPort[] };
  os?: { osmatch?: { '@_name'?: string; '@_accuracy'?: string } | Array<{ '@_name'?: string; '@_accuracy'?: string }> };
};

type NmapRun = {
  nmaprun?: {
    host?: NmapHost | NmapHost[];
  };
};

function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function parseAddresses(address: NmapAddress | NmapAddress[] | undefined): {
  ip?: string;
  mac?: string;
} {
  const result: { ip?: string; mac?: string } = {};
  for (const entry of asArray(address)) {
    if (entry['@_addrtype'] === 'ipv4' || entry['@_addrtype'] === 'ipv6') {
      if (entry['@_addr'] !== undefined) result.ip = entry['@_addr'];
    }
    if (entry['@_addrtype'] === 'mac' && entry['@_addr'] !== undefined) {
      result.mac = entry['@_addr'];
    }
  }
  return result;
}

function parseHostname(host: NmapHost): string | undefined {
  const hostnameNode = host.hostnames?.hostname;
  if (hostnameNode === undefined) return undefined;
  const first = asArray(hostnameNode)[0];
  return first?.['@_name'];
}

function parseOs(host: NmapHost): { os?: string; osConfidence?: number } {
  const match = asArray(host.os?.osmatch)[0];
  if (match === undefined) return {};
  const result: { os?: string; osConfidence?: number } = {};
  if (match['@_name'] !== undefined) result.os = match['@_name'];
  const accuracy = match['@_accuracy'];
  if (accuracy !== undefined) {
    result.osConfidence = Number.parseInt(accuracy, 10);
  }
  return result;
}

function parseServices(host: NmapHost): Service[] {
  const services: Service[] = [];
  for (const port of asArray(host.ports?.port)) {
    if (port.state?.['@_state'] !== 'open') continue;
    const portNum = Number.parseInt(port['@_portid'] ?? '', 10);
    if (Number.isNaN(portNum)) continue;
    const protocol = port['@_protocol'] === 'udp' ? 'udp' : 'tcp';
    const service: Service = {
      port: portNum,
      protocol,
    };
    if (port.service?.['@_product'] !== undefined) {
      service.product = port.service['@_product'];
    }
    if (port.service?.['@_version'] !== undefined) {
      service.version = port.service['@_version'];
    }
    if (port.service?.['@_name'] !== undefined) {
      service.banner = port.service['@_name'];
    }
    services.push(service);
  }
  return services;
}

function parseHost(host: NmapHost): Host | null {
  if (host.status?.['@_state'] !== 'up') return null;
  const { ip, mac } = parseAddresses(host.address);
  if (ip === undefined) return null;
  const { os, osConfidence } = parseOs(host);
  const hostname = parseHostname(host);
  const result: Host = {
    ip,
    services: parseServices(host),
  };
  if (hostname !== undefined) result.hostname = hostname;
  if (mac !== undefined) result.mac = mac;
  if (os !== undefined) result.os = os;
  if (osConfidence !== undefined) result.osConfidence = osConfidence;
  return result;
}

export function parseNmapXml(xml: string): Result<Host[], ScanError> {
  try {
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
    });
    const parsed = parser.parse(xml) as NmapRun;
    if (parsed.nmaprun === undefined) {
      return err(scanError('PARSE_FAILED', 'Missing nmaprun root element'));
    }
    const hosts = asArray(parsed.nmaprun.host)
      .map(parseHost)
      .filter((host): host is Host => host !== null);
    return ok(hosts);
  } catch (cause) {
    return err(scanError('PARSE_FAILED', 'Failed to parse nmap XML output', cause));
  }
}
