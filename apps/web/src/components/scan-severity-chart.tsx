'use client';

import type { Finding } from '@sniffoutpro/types';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

const SEVERITY_ORDER = ['critical', 'high', 'medium', 'low', 'info'] as const;

function buildSeverityRows(findings: Finding[]) {
  const counts = new Map<string, number>();
  for (const severity of SEVERITY_ORDER) {
    counts.set(severity, 0);
  }
  for (const finding of findings) {
    counts.set(finding.severity, (counts.get(finding.severity) ?? 0) + 1);
  }
  return SEVERITY_ORDER.map((severity) => ({
    severity,
    count: counts.get(severity) ?? 0,
  }));
}

type ScanSeverityChartProps = {
  findings: Finding[];
};

export function ScanSeverityChart({ findings }: ScanSeverityChartProps) {
  const data = buildSeverityRows(findings);
  const total = findings.length;

  if (total === 0) {
    return <p className="metrics-empty">No findings in this scan.</p>;
  }

  return (
    <div className="severity-chart" data-testid="severity-chart">
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
          <XAxis dataKey="severity" stroke="#94a3b8" />
          <YAxis allowDecimals={false} stroke="#94a3b8" />
          <Tooltip
            contentStyle={{ background: '#0f172a', border: '1px solid #334155' }}
            labelStyle={{ color: '#e2e8f0' }}
          />
          <Bar dataKey="count" fill="#38bdf8" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
