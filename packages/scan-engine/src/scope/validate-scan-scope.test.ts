import { describe, expect, it } from 'vitest';
import { validateScanScope } from './validate-scan-scope.js';

describe('validateScanScope', () => {
  it('accepts a single public IP', () => {
    const result = validateScanScope('8.8.8.8');
    expect(result.isOk()).toBe(true);
    if (!result.isOk()) return;
    expect(result.value.targets).toEqual(['8.8.8.8']);
    expect(result.value.estimatedHosts).toBe(1);
  });

  it('rejects targets that start with - (nmap flag injection)', () => {
    const result = validateScanScope('--script=vuln 8.8.8.8');
    expect(result.isErr()).toBe(true);
    if (!result.isErr()) return;
    expect(result.error.code).toBe('INVALID_TARGET');
  });

  it('rejects CIDR larger than /16 by default', () => {
    const result = validateScanScope('10.0.0.0/8', { allowPrivateOverride: true });
    expect(result.isErr()).toBe(true);
    if (!result.isErr()) return;
    expect(result.error.code).toBe('CIDR_TOO_LARGE');
  });

  it('accepts /24 with private override', () => {
    const result = validateScanScope('192.168.1.0/24', { allowPrivateOverride: true });
    expect(result.isOk()).toBe(true);
    if (!result.isOk()) return;
    expect(result.value.estimatedHosts).toBe(256);
  });

  it('blocks private ranges without override', () => {
    const result = validateScanScope('192.168.1.1');
    expect(result.isErr()).toBe(true);
    if (!result.isErr()) return;
    expect(result.error.code).toBe('PRIVATE_RANGE');
  });

  it('blocks loopback without private override', () => {
    const result = validateScanScope('127.0.0.1');
    expect(result.isErr()).toBe(true);
    if (!result.isErr()) return;
    expect(result.error.code).toBe('PRIVATE_RANGE');
  });

  it('allows loopback with private override', () => {
    const result = validateScanScope('127.0.0.1', { allowPrivateOverride: true });
    expect(result.isOk()).toBe(true);
  });

  it('blocks reserved ranges without override', () => {
    const result = validateScanScope('0.0.0.0');
    expect(result.isErr()).toBe(true);
    if (!result.isErr()) return;
    expect(result.error.code).toBe('RESERVED_RANGE');
  });

  it('rejects empty targets', () => {
    const result = validateScanScope('   ');
    expect(result.isErr()).toBe(true);
    if (!result.isErr()) return;
    expect(result.error.code).toBe('INVALID_TARGET');
  });

  it('accepts localhost hostname with private override not required for hostnames', () => {
    const result = validateScanScope('localhost');
    expect(result.isOk()).toBe(true);
  });

  it('accepts an array of targets and sums their hosts', () => {
    const result = validateScanScope([' 8.8.8.8 ', 'scanme.nmap.org', '1.1.1.0/28', '']);
    expect(result.isOk()).toBe(true);
    if (!result.isOk()) return;
    expect(result.value.targets).toEqual(['8.8.8.8', 'scanme.nmap.org', '1.1.1.0/28']);
    expect(result.value.estimatedHosts).toBe(18);
    expect(result.value.estimatedJobSize).toBe(18 * 65536);
    expect(result.value.warnings).toEqual([]);
  });

  it('splits a comma and whitespace separated string', () => {
    const result = validateScanScope('8.8.8.8, 8.8.4.4\n1.1.1.1');
    expect(result.isOk()).toBe(true);
    if (!result.isOk()) return;
    expect(result.value.targets).toEqual(['8.8.8.8', '8.8.4.4', '1.1.1.1']);
  });

  it.each(['bad_host!', '8.8.8.8/33', '256.1.1.1/24', 'host..example.com'])(
    'rejects malformed target %s',
    (target) => {
      const result = validateScanScope(target);
      expect(result.isErr()).toBe(true);
      if (!result.isErr()) return;
      expect(result.error.code).toBe('INVALID_TARGET');
    },
  );

  it.each(['10.1.2.3', '172.16.0.1', '172.31.255.255', '169.254.10.20'])(
    'blocks private address %s without override',
    (target) => {
      const result = validateScanScope(target);
      expect(result.isErr()).toBe(true);
      if (!result.isErr()) return;
      expect(result.error.code).toBe('PRIVATE_RANGE');
    },
  );

  it.each(['224.0.0.1', '239.255.255.250', '240.0.0.1', '255.255.255.255', '100.64.0.1'])(
    'blocks reserved address %s without override',
    (target) => {
      const result = validateScanScope(target);
      expect(result.isErr()).toBe(true);
      if (!result.isErr()) return;
      expect(result.error.code).toBe('RESERVED_RANGE');
    },
  );

  it.each(['172.15.255.255', '172.32.0.1', '100.63.255.255', '100.128.0.1', '223.255.255.255'])(
    'accepts public address %s next to a blocked range',
    (target) => {
      expect(validateScanScope(target).isOk()).toBe(true);
    },
  );

  it('allows reserved addresses with reserved override', () => {
    expect(validateScanScope('100.64.0.1', { allowReservedOverride: true }).isOk()).toBe(true);
  });

  it('honours a custom max CIDR prefix', () => {
    const result = validateScanScope('8.8.0.0/20', { maxCidrPrefix: 24 });
    expect(result.isErr()).toBe(true);
    if (!result.isErr()) return;
    expect(result.error.code).toBe('CIDR_TOO_LARGE');
  });

  it('rejects scopes over the host limit', () => {
    const result = validateScanScope('8.8.8.0/24, 8.8.4.0/24');
    expect(result.isErr()).toBe(true);
    if (!result.isErr()) return;
    expect(result.error.code).toBe('JOB_TOO_LARGE');
    expect(result.error.message).toContain('512 hosts');
  });

  it('rejects scopes over the job size limit', () => {
    const result = validateScanScope('8.8.8.0/30', { estimatedPorts: 1000, maxJobSize: 3999 });
    expect(result.isErr()).toBe(true);
    if (!result.isErr()) return;
    expect(result.error.code).toBe('JOB_TOO_LARGE');
    expect(result.error.message).toContain('job size 4000');
  });

  it('warns on large scopes allowed by a raised host limit', () => {
    const result = validateScanScope('8.8.8.0/23', { maxHosts: 512, estimatedPorts: 1000 });
    expect(result.isOk()).toBe(true);
    if (!result.isOk()) return;
    expect(result.value.estimatedHosts).toBe(512);
    expect(result.value.estimatedJobSize).toBe(512_000);
    expect(result.value.warnings).toEqual(['Large scope: ~512 hosts']);
  });
});
