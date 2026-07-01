import { ok, type Result } from 'neverthrow';
import type { Finding, Host, Severity } from '@sniffoutpro/types';
import { scoreRisk, type RiskInput } from '../risk/score.js';

export type CveAffectedProduct = {
  product: string;
  vendor?: string;
  versionStart?: string;
  versionEnd?: string;
};

export type CveCacheEntry = {
  id: string;
  description?: string;
  cvssScore?: number;
  affectedProducts: CveAffectedProduct[];
};

export type ServiceContext = {
  host: Host;
  port: number;
  protocol: 'tcp' | 'udp';
  product?: string;
  version?: string;
};

function normalizeProduct(value: string): string {
  return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

function productMatches(serviceProduct: string, affected: CveAffectedProduct): boolean {
  const normalizedService = normalizeProduct(serviceProduct);
  const normalizedAffected = normalizeProduct(affected.product);
  return (
    normalizedService.includes(normalizedAffected) ||
    normalizedAffected.includes(normalizedService)
  );
}

function versionInRange(version: string | undefined, start?: string, end?: string): boolean {
  if (version === undefined) return true;
  if (start !== undefined && version < start) return false;
  if (end !== undefined && version > end) return false;
  return true;
}

function cvssToSeverity(cvss: number | undefined): Severity {
  if (cvss === undefined) return 'info';
  if (cvss >= 9.0) return 'critical';
  if (cvss >= 7.0) return 'high';
  if (cvss >= 4.0) return 'medium';
  if (cvss > 0) return 'low';
  return 'info';
}

export function correlateCves(
  services: ServiceContext[],
  cveEntries: CveCacheEntry[],
): Result<Finding[], never> {
  const findings: Finding[] = [];
  const seen = new Set<string>();

  for (const service of services) {
    if (service.product === undefined) continue;
    for (const cve of cveEntries) {
      for (const affected of cve.affectedProducts) {
        if (!productMatches(service.product, affected)) continue;
        if (!versionInRange(service.version, affected.versionStart, affected.versionEnd)) continue;

        const dedupeKey = `${service.host.ip}:${String(service.port)}:${cve.id}`;
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);

        const cvssScore = cve.cvssScore;
        const severity = cvssToSeverity(cvssScore);
        const riskInput: RiskInput = {
          severity,
          exposure: service.host.ip.startsWith('127.') ? 'local' : 'network',
        };
        if (cvssScore !== undefined) {
          riskInput.cvssScore = cvssScore;
        }
        const riskScore = scoreRisk(riskInput);

        findings.push({
          id: crypto.randomUUID(),
          cveId: cve.id,
          title: cve.id,
          severity,
          riskScore,
          hostIp: service.host.ip,
          port: service.port,
          description: cve.description,
          ...(cvssScore !== undefined ? { cvssScore } : {}),
        });
      }
    }
  }

  return ok(findings);
}

export function hostsToServiceContexts(hosts: Host[]): ServiceContext[] {
  return hosts.flatMap((host) =>
    host.services.map((svc) => {
      const ctx: ServiceContext = {
        host,
        port: svc.port,
        protocol: svc.protocol,
      };
      if (svc.product !== undefined) ctx.product = svc.product;
      if (svc.version !== undefined) ctx.version = svc.version;
      return ctx;
    }),
  );
}
