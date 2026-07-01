import { describe, expect, it } from 'vitest';
import type { ScanRun } from '@sniffoutpro/types';
import { diffScanRuns } from '../diff/scan-diff.js';

const baseRun: ScanRun = {
  id: '00000000-0000-4000-8000-000000000001',
  status: 'completed',
  targets: ['127.0.0.1'],
  intensity: 'standard',
  startedAt: '2026-06-22T00:00:00.000Z',
  completedAt: '2026-06-22T00:01:00.000Z',
  hosts: [],
  findings: [
    {
      id: '00000000-0000-4000-8000-000000000010',
      cveId: 'CVE-2021-44228',
      title: 'Log4j RCE',
      severity: 'critical',
      riskScore: 95,
      hostIp: '127.0.0.1',
      port: 8080,
    },
  ],
};

describe('diffScanRuns', () => {
  it('detects new and resolved findings between runs', () => {
    const compareRun: ScanRun = {
      ...baseRun,
      id: '00000000-0000-4000-8000-000000000002',
      findings: [
        {
          id: '00000000-0000-4000-8000-000000000011',
          cveId: 'CVE-2021-34527',
          title: 'PrintNightmare',
          severity: 'high',
          riskScore: 80,
          hostIp: '192.168.1.10',
          port: 445,
        },
      ],
    };

    const diff = diffScanRuns(baseRun, compareRun);
    expect(diff.newFindings).toHaveLength(1);
    expect(diff.newFindings[0]?.cveId).toBe('CVE-2021-34527');
    expect(diff.resolvedFindings).toHaveLength(1);
    expect(diff.resolvedFindings[0]?.cveId).toBe('CVE-2021-44228');
    expect(diff.unchangedCount).toBe(0);
  });
});
