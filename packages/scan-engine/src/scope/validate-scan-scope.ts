import { err, ok, type Result } from 'neverthrow';
import { scanError, type ScanError } from '../errors.js';

export type ScopeValidationOptions = {
  /** Smallest allowed CIDR prefix (largest network). Default 16 → max /16. */
  maxCidrPrefix?: number;
  /** Max hosts implied by CIDR expansion before requiring override. Default 256. */
  maxHosts?: number;
  /** Max ports × hosts product. Default 65536 * 256. */
  maxJobSize?: number;
  /** Estimated port count for job-size check. Default 65536. */
  estimatedPorts?: number;
  /** Allow RFC1918 / link-local / loopback without override. Default false. */
  allowPrivateOverride?: boolean;
  /** Allow reserved/documentation ranges without override. Default false. */
  allowReservedOverride?: boolean;
};

export type ScopeValidationOk = {
  targets: string[];
  warnings: string[];
  estimatedHosts: number;
  estimatedJobSize: number;
};

const DEFAULTS = {
  maxCidrPrefix: 16,
  maxHosts: 256,
  maxJobSize: 65536 * 256,
  estimatedPorts: 65536,
  allowPrivateOverride: false,
  allowReservedOverride: false,
} as const;

const IPV4_RE = /^(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)$/;
const CIDR_RE =
  /^(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\/(?:3[0-2]|[12]?\d)$/;
const HOSTNAME_RE =
  /^(?=.{1,253}$)(?!-)[a-zA-Z0-9-]{1,63}(?<!-)(?:\.(?!-)[a-zA-Z0-9-]{1,63}(?<!-))*$/;

function parseTargets(raw: string | string[]): string[] {
  const parts = Array.isArray(raw) ? raw : raw.split(/[\s,]+/);
  return parts.map((t) => t.trim()).filter((t) => t.length > 0);
}

function cidrHostCount(prefix: number): number {
  if (prefix < 0 || prefix > 32) return Number.POSITIVE_INFINITY;
  return 2 ** (32 - prefix);
}

function ipv4ToInt(ip: string): number {
  const parts = ip.split('.').map((p) => Number.parseInt(p, 10));
  const a = parts[0] ?? 0;
  const b = parts[1] ?? 0;
  const c = parts[2] ?? 0;
  const d = parts[3] ?? 0;
  return ((a << 24) | (b << 16) | (c << 8) | d) >>> 0;
}

function isPrivateIpv4(ip: string): boolean {
  const n = ipv4ToInt(ip);
  // 10.0.0.0/8
  if (n >= ipv4ToInt('10.0.0.0') && n <= ipv4ToInt('10.255.255.255')) return true;
  // 172.16.0.0/12
  if (n >= ipv4ToInt('172.16.0.0') && n <= ipv4ToInt('172.31.255.255')) return true;
  // 192.168.0.0/16
  if (n >= ipv4ToInt('192.168.0.0') && n <= ipv4ToInt('192.168.255.255')) return true;
  // 127.0.0.0/8 loopback
  if (n >= ipv4ToInt('127.0.0.0') && n <= ipv4ToInt('127.255.255.255')) return true;
  // 169.254.0.0/16 link-local
  if (n >= ipv4ToInt('169.254.0.0') && n <= ipv4ToInt('169.254.255.255')) return true;
  return false;
}

function isReservedIpv4(ip: string): boolean {
  const n = ipv4ToInt(ip);
  // 0.0.0.0/8
  if (n >= ipv4ToInt('0.0.0.0') && n <= ipv4ToInt('0.255.255.255')) return true;
  // 224.0.0.0/4 multicast
  if (n >= ipv4ToInt('224.0.0.0') && n <= ipv4ToInt('239.255.255.255')) return true;
  // 240.0.0.0/4 reserved
  if (n >= ipv4ToInt('240.0.0.0') && n <= ipv4ToInt('255.255.255.255')) return true;
  // 100.64.0.0/10 CGNAT
  if (n >= ipv4ToInt('100.64.0.0') && n <= ipv4ToInt('100.127.255.255')) return true;
  return false;
}

function classifyTarget(target: string): {
  kind: 'ip' | 'cidr' | 'hostname';
  hosts: number;
  ip?: string;
  prefix?: number;
} | null {
  if (target.startsWith('-')) return null;

  if (CIDR_RE.test(target)) {
    const [ip, prefixStr] = target.split('/') as [string, string];
    const prefix = Number.parseInt(prefixStr, 10);
    return { kind: 'cidr', hosts: cidrHostCount(prefix), ip, prefix };
  }
  if (IPV4_RE.test(target)) {
    return { kind: 'ip', hosts: 1, ip: target };
  }
  if (HOSTNAME_RE.test(target) || target === 'localhost') {
    return { kind: 'hostname', hosts: 1 };
  }
  return null;
}

/**
 * Validate scan targets before dispatch. Enforced in desktop UI and re-checked
 * at the Rust privilege boundary (defense in depth).
 */
export function validateScanScope(
  rawTargets: string | string[],
  opts: ScopeValidationOptions = {},
): Result<ScopeValidationOk, ScanError> {
  const options = { ...DEFAULTS, ...opts };
  const targets = parseTargets(rawTargets);
  const warnings: string[] = [];

  if (targets.length === 0) {
    return err(scanError('INVALID_TARGET', 'At least one scan target is required'));
  }

  let estimatedHosts = 0;

  for (const target of targets) {
    const classified = classifyTarget(target);
    if (classified === null) {
      return err(
        scanError(
          'INVALID_TARGET',
          `Invalid or disallowed target "${target}" (must be IPv4, CIDR, or hostname; must not start with -)`,
        ),
      );
    }

    if (classified.kind === 'cidr' && classified.prefix !== undefined) {
      if (classified.prefix < options.maxCidrPrefix) {
        return err(
          scanError(
            'CIDR_TOO_LARGE',
            `CIDR ${target} exceeds max /${String(options.maxCidrPrefix)} — confirm a smaller scope or raise the limit`,
          ),
        );
      }
    }

    if (classified.ip !== undefined) {
      if (isPrivateIpv4(classified.ip) && !options.allowPrivateOverride) {
        return err(
          scanError(
            'PRIVATE_RANGE',
            `Target ${target} is private/loopback/link-local — set allowPrivateOverride to proceed`,
          ),
        );
      }
      if (isReservedIpv4(classified.ip) && !options.allowReservedOverride) {
        return err(
          scanError(
            'RESERVED_RANGE',
            `Target ${target} is reserved/multicast — set allowReservedOverride to proceed`,
          ),
        );
      }
    }

    estimatedHosts += classified.hosts;
  }

  if (estimatedHosts > options.maxHosts) {
    return err(
      scanError(
        'JOB_TOO_LARGE',
        `Estimated ${String(estimatedHosts)} hosts exceeds max ${String(options.maxHosts)} — confirm job size override`,
      ),
    );
  }

  const estimatedJobSize = estimatedHosts * options.estimatedPorts;
  if (estimatedJobSize > options.maxJobSize) {
    return err(
      scanError(
        'JOB_TOO_LARGE',
        `Estimated job size ${String(estimatedJobSize)} (hosts×ports) exceeds max ${String(options.maxJobSize)}`,
      ),
    );
  }

  if (estimatedHosts > 64) {
    warnings.push(`Large scope: ~${String(estimatedHosts)} hosts`);
  }

  return ok({ targets, warnings, estimatedHosts, estimatedJobSize });
}
