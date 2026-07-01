import type { Severity } from '@sniffoutpro/types';

export type RiskInput = {
  cvssScore?: number;
  severity: Severity;
  exposure: 'local' | 'network';
  assetCriticality?: number;
};

const SEVERITY_WEIGHT: Record<Severity, number> = {
  critical: 100,
  high: 75,
  medium: 50,
  low: 25,
  info: 10,
};

export function scoreRisk(input: RiskInput): number {
  const cvssComponent = input.cvssScore !== undefined ? input.cvssScore * 6 : 0;
  const severityComponent = SEVERITY_WEIGHT[input.severity] * 0.25;
  const exposureMultiplier = input.exposure === 'network' ? 1.2 : 0.8;
  const criticality = input.assetCriticality ?? 1;
  const raw = (cvssComponent + severityComponent) * exposureMultiplier * criticality;
  return Math.min(100, Math.round(raw));
}
