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
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function tokenize(value: string): string[] {
  return normalizeProduct(value)
    .split(/\s+/)
    .filter((t) => t.length > 0);
}

/**
 * Prefer exact normalized match, then whole-token overlap.
 * Rejects short bidirectional substring matches (e.g. "ssh" ⊃ "sh").
 */
function productMatches(serviceProduct: string, affected: CveAffectedProduct): boolean {
  const normalizedService = normalizeProduct(serviceProduct);
  const normalizedAffected = normalizeProduct(affected.product);
  if (normalizedService.length === 0 || normalizedAffected.length === 0) return false;
  if (normalizedService === normalizedAffected) return true;

  const serviceTokens = new Set(tokenize(serviceProduct));
  const affectedTokens = tokenize(affected.product);
  if (affectedTokens.length === 0) return false;

  // All affected tokens must appear as whole tokens in the service product.
  // Tokens shorter than 3 chars are ignored to avoid "sh"/"os" noise.
  const significant = affectedTokens.filter((t) => t.length >= 3);
  if (significant.length === 0) {
    return affectedTokens.every((t) => serviceTokens.has(t));
  }
  return significant.every((t) => serviceTokens.has(t));
}

function parseVersionParts(version: string): number[] {
  const cleaned = version.trim().replace(/^v/i, '');
  const parts = cleaned.split(/[.+_-]/).map((p) => {
    const n = Number.parseInt(p.replace(/[^0-9].*$/, ''), 10);
    return Number.isFinite(n) ? n : 0;
  });
  return parts.length > 0 ? parts : [0];
}

/** Semver-aware compare: negative if a<b, 0 if equal, positive if a>b. */
export function compareVersions(a: string, b: string): number {
  const pa = parseVersionParts(a);
  const pb = parseVersionParts(b);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i += 1) {
    const da = pa[i] ?? 0;
    const db = pb[i] ?? 0;
    if (da !== db) return da - db;
  }
  return 0;
}

function versionInRange(version: string | undefined, start?: string, end?: string): boolean {
  if (version === undefined) return true;
  if (start !== undefined && compareVersions(version, start) < 0) return false;
  if (end !== undefined && compareVersions(version, end) > 0) return false;
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
