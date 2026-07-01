import type { Finding, ScanRun } from '@sniffoutpro/types';

export type ScanDiffSummary = {
  newFindings: Finding[];
  resolvedFindings: Finding[];
  unchangedCount: number;
};

function findingKey(finding: Finding): string {
  const port = finding.port !== undefined ? String(finding.port) : '';
  return `${finding.cveId ?? finding.title}|${finding.hostIp}|${port}`;
}

export function diffScanRuns(base: ScanRun, compare: ScanRun): ScanDiffSummary {
  const baseKeys = new Set(base.findings.map(findingKey));
  const compareKeys = new Set(compare.findings.map(findingKey));

  const newFindings = compare.findings.filter((f) => !baseKeys.has(findingKey(f)));
  const resolvedFindings = base.findings.filter((f) => !compareKeys.has(findingKey(f)));
  const unchangedCount = compare.findings.filter((f) => baseKeys.has(findingKey(f))).length;

  return { newFindings, resolvedFindings, unchangedCount };
}
