'use client';

import dynamic from 'next/dynamic';
import { useState } from 'react';
import { trpc } from '../components/providers';
import { ScanHistory } from './scan-history';
import { ScanSeverityChart } from './scan-severity-chart';

const TopologyGraph = dynamic(() => import('@sniffoutpro/ui').then((mod) => mod.TopologyGraph), {
  ssr: false,
});

export function DashboardClient() {
  const [selectedScanId, setSelectedScanId] = useState<string | null>(null);
  const [selectedHostIp, setSelectedHostIp] = useState<string | null>(null);
  const [compareScanId, setCompareScanId] = useState<string | null>(null);

  const health = trpc.health.ping.useQuery();
  const scans = trpc.scans.list.useQuery({ limit: 20 });
  const detail = trpc.scans.getDetail.useQuery(
    { id: selectedScanId ?? '' },
    { enabled: selectedScanId !== null },
  );
  const diff = trpc.scans.diff.useQuery(
    {
      baseScanId: compareScanId ?? '',
      compareScanId: selectedScanId ?? '',
    },
    {
      enabled:
        selectedScanId !== null && compareScanId !== null && compareScanId !== selectedScanId,
    },
  );

  const scan = detail.data?.scan;
  const selectedHost = scan?.hosts.find((h) => h.ip === selectedHostIp);

  return (
    <main className="page dashboard">
      <header className="hero">
        <p className="eyebrow">SniffOutPro — Workstation</p>
        <h1>Scan dashboard</h1>
        <p className="lede">
          Cloud-synced scan history from the desktop agent. API status:{' '}
          {health.data?.status ?? 'loading…'}
        </p>
      </header>

      <section className="panel grid-two">
        <div>
          <h2>Scan history</h2>
          {scans.isLoading && <p>Loading scans…</p>}
          {scans.data !== undefined && (
            <ScanHistory
              scans={scans.data}
              selectedScanId={selectedScanId}
              onSelect={(id) => {
                setSelectedScanId(id);
                setSelectedHostIp(null);
              }}
            />
          )}
        </div>

        <div>
          <h2>Compare runs</h2>
          <label>
            Baseline scan
            <select
              value={compareScanId ?? ''}
              onChange={(e) => {
                setCompareScanId(e.target.value || null);
              }}
            >
              <option value="">Select baseline…</option>
              {scans.data?.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.targets.join(', ')} ({new Date(row.startedAt).toLocaleDateString()})
                </option>
              ))}
            </select>
          </label>
          {diff.data !== null && diff.data !== undefined && (
            <ul className="diff-summary">
              <li>New findings: {String(diff.data.newCount)}</li>
              <li>Resolved: {String(diff.data.resolvedCount)}</li>
              <li>Unchanged: {String(diff.data.unchangedCount)}</li>
            </ul>
          )}
        </div>
      </section>

      {scan != null && (
        <>
          {scan.source === 'fixture' && (
            <p className="provenance-badge fixture" role="status">
              LAB FIXTURE — this scan contains sample data, not live findings
            </p>
          )}
          {scan.source === undefined && (
            <p className="provenance-badge unverified" role="status">
              Provenance unverified — synced before source tracking (treat as unconfirmed, not live)
            </p>
          )}
          <section className="panel">
            <h2>Finding severity</h2>
            <ScanSeverityChart findings={scan.findings} />
          </section>

          <section className="panel">
            <h2>
              Topology — {scan.hosts.length} hosts, {scan.findings.length} findings
            </h2>
            <TopologyGraph
              hosts={scan.hosts}
              findings={scan.findings}
              selectedHostIp={selectedHostIp}
              onSelectHost={(ip) => {
                setSelectedHostIp(ip);
              }}
              width={900}
              height={400}
            />
          </section>

          <section className="panel grid-two">
            <div>
              <h2>Findings</h2>
              <ul className="findings-list">
                {scan.findings.map((f) => (
                  <li key={f.id} className={`sev-${f.severity}`}>
                    <strong>{f.title}</strong> — {f.hostIp}
                    {f.port !== undefined ? `:${String(f.port)}` : ''}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h2>Host detail</h2>
              {selectedHost !== undefined ? (
                <>
                  <p>
                    <strong>{selectedHost.hostname ?? selectedHost.ip}</strong>
                  </p>
                  <ul>
                    {selectedHost.services.map((s) => (
                      <li key={`${s.protocol}-${String(s.port)}`}>
                        {String(s.port)}/{s.protocol} {s.product ?? ''}
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <p>Select a host on the graph.</p>
              )}
            </div>
          </section>
        </>
      )}
    </main>
  );
}
