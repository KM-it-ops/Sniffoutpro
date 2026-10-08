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
});
