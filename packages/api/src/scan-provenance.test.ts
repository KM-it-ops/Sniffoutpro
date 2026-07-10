import { describe, expect, it } from 'vitest';
import type { ScanRun } from '@sniffoutpro/types';
import { provenanceFromNormalizedOutput, toNormalizedOutput } from './routers/scans.js';

function buildScanRun(source?: ScanRun['source']): ScanRun {
  const startedAt = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    status: 'completed',
    targets: ['127.0.0.1'],
    intensity: 'standard',
    startedAt,
    completedAt: startedAt,
    hosts: [],
    findings: [],
    ...(source !== undefined ? { source } : {}),
  };
}

describe('C3 — scan provenance round-trips through normalized_output', () => {
  it('persists source=fixture in the sync payload', () => {
    const normalized = toNormalizedOutput(buildScanRun('fixture'));
    expect(normalized.source).toBe('fixture');
    expect(provenanceFromNormalizedOutput(normalized)).toBe('fixture');
  });

  it('persists source=live in the sync payload', () => {
    const normalized = toNormalizedOutput(buildScanRun('live'));
    expect(normalized.source).toBe('live');
    expect(provenanceFromNormalizedOutput(normalized)).toBe('live');
  });

  it('omits source when the desktop client did not send one (legacy payloads)', () => {
    const normalized = toNormalizedOutput(buildScanRun());
    expect('source' in normalized).toBe(false);
    expect(provenanceFromNormalizedOutput(normalized)).toBeUndefined();
  });

  it('never invents provenance from malformed stored payloads', () => {
    expect(provenanceFromNormalizedOutput(null)).toBeUndefined();
    expect(provenanceFromNormalizedOutput(undefined)).toBeUndefined();
    expect(provenanceFromNormalizedOutput('fixture')).toBeUndefined();
    expect(provenanceFromNormalizedOutput({ source: 'bogus' })).toBeUndefined();
    expect(provenanceFromNormalizedOutput({ source: 42 })).toBeUndefined();
    expect(provenanceFromNormalizedOutput({ source: null })).toBeUndefined();
    expect(provenanceFromNormalizedOutput([])).toBeUndefined();
    expect(provenanceFromNormalizedOutput(['fixture'])).toBeUndefined();
    expect(provenanceFromNormalizedOutput({ source: { source: 'live' } })).toBeUndefined();
  });
});
