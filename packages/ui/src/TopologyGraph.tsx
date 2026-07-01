import { useCallback, useMemo, useRef } from 'react';
import ForceGraph2D, { type ForceGraphMethods } from 'react-force-graph-2d';
import type { Finding, Host } from '@sniffoutpro/types';

export type TopologyNode = {
  id: string;
  ip: string;
  label: string;
  severity: Finding['severity'];
  portCount: number;
};

export type TopologyGraphProps = {
  hosts: Host[];
  findings: Finding[];
  selectedHostIp?: string | null;
  onSelectHost?: (ip: string) => void;
  width?: number;
  height?: number;
};

const SEVERITY_COLOR: Record<Finding['severity'], string> = {
  critical: '#dc2626',
  high: '#ea580c',
  medium: '#ca8a04',
  low: '#2563eb',
  info: '#64748b',
};

const SEVERITY_RANK: Record<Finding['severity'], number> = {
  critical: 5,
  high: 4,
  medium: 3,
  low: 2,
  info: 1,
};

function maxSeverity(findings: Finding[]): Finding['severity'] {
  if (findings.length === 0) return 'info';
  let maxSev: Finding['severity'] = 'info';
  for (const finding of findings) {
    if (SEVERITY_RANK[finding.severity] > SEVERITY_RANK[maxSev]) {
      maxSev = finding.severity;
    }
  }
  return maxSev;
}

export function TopologyGraph({
  hosts,
  findings,
  selectedHostIp = null,
  onSelectHost,
  width = 640,
  height = 400,
}: TopologyGraphProps) {
  const graphRef = useRef<ForceGraphMethods<TopologyNode, { source: string; target: string }> | undefined>(
    undefined,
  );

  const nodes: TopologyNode[] = useMemo(
    () =>
      hosts.map((host) => {
        const hostFindings = findings.filter((f) => f.hostIp === host.ip);
        return {
          id: host.ip,
          ip: host.ip,
          label: host.hostname ?? host.ip,
          severity: maxSeverity(hostFindings),
          portCount: host.services.length,
        };
      }),
    [hosts, findings],
  );

  const links = useMemo(() => {
    const result: Array<{ source: string; target: string }> = [];
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i];
        const b = nodes[j];
        if (a !== undefined && b !== undefined) {
          result.push({ source: a.id, target: b.id });
        }
      }
    }
    return result;
  }, [nodes]);

  const handleNodeClick = useCallback(
    (node: TopologyNode) => {
      onSelectHost?.(node.ip);
    },
    [onSelectHost],
  );

  if (nodes.length === 0) {
    return (
      <div className="topology-empty" style={{ width, height }}>
        No hosts discovered yet.
      </div>
    );
  }

  return (
    <ForceGraph2D
      ref={graphRef}
      width={width}
      height={height}
      graphData={{ nodes, links }}
      nodeLabel={(n: TopologyNode) => `${n.label} (${String(n.portCount)} ports)`}
      nodeVal={(n: TopologyNode) => Math.max(4, n.portCount)}
      nodeColor={(n: TopologyNode) =>
        n.ip === selectedHostIp ? '#38bdf8' : SEVERITY_COLOR[n.severity]
      }
      linkColor={() => '#334155'}
      onNodeClick={handleNodeClick}
      backgroundColor="#0b1220"
    />
  );
}
