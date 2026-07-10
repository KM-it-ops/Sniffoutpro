import { lazy, Suspense, useState } from 'react';

import type { Finding, Host, ScanIntensity, ScanRun } from '@sniffoutpro/types';

import { RootErrorBoundary } from './RootErrorBoundary';

import './styles.css';

const TopologyGraph = lazy(async () => {
  const mod = await import('@sniffoutpro/ui');

  return { default: mod.TopologyGraph };
});

const CONSENT = 'I own or have written authorization to scan the targets listed below.';

function DesktopApp() {
  const [targets, setTargets] = useState('127.0.0.1');

  const [intensity, setIntensity] = useState<ScanIntensity>('standard');

  const [consented, setConsented] = useState(false);

  const [useFixture, setUseFixture] = useState(true);

  const [allowPrivateOverride, setAllowPrivateOverride] = useState(true);

  const [allowFixtureFallback, setAllowFixtureFallback] = useState(false);

  const [progress, setProgress] = useState<string | null>(null);

  const [scanRun, setScanRun] = useState<ScanRun | null>(null);

  const [selectedHostIp, setSelectedHostIp] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);

  const [running, setRunning] = useState(false);

  const [syncStatus, setSyncStatus] = useState<string | null>(null);

  const selectedHost: Host | undefined = scanRun?.hosts.find((h) => h.ip === selectedHostIp);

  const selectedFindings: Finding[] =
    scanRun?.findings.filter((f) => f.hostIp === selectedHostIp) ?? [];

  async function handleScan(): Promise<void> {
    if (!consented) {
      setError('Authorization consent is required before scanning.');

      return;
    }

    setError(null);

    setRunning(true);

    setProgress('Starting…');

    try {
      const { runDesktopScan } = await import('./lib/run-scan');

      const result = await runDesktopScan(
        {
          targets,

          intensity,

          consentText: CONSENT,

          useFixture,

          allowPrivateOverride,

          allowFixtureFallback,
        },

        (p) => {
          setProgress(`${String(p.percent)}% — ${p.message}`);
        },
      );

      setScanRun(result);

      setSelectedHostIp(result.hosts[0]?.ip ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Scan failed');
    } finally {
      setRunning(false);
    }
  }

  async function handleSync(): Promise<void> {
    if (scanRun === null) {
      return;
    }

    setSyncStatus('Syncing to cloud…');

    try {
      const { syncScanToCloud } = await import('./lib/sync-scan');

      await syncScanToCloud(scanRun, CONSENT);

      setSyncStatus('Synced — open http://localhost:3000/dashboard');
    } catch (e) {
      setSyncStatus(e instanceof Error ? e.message : 'Sync failed');
    }
  }

  return (
    <main className="shell">
      <header>
        <p className="eyebrow">SniffOutPro Desktop Agent</p>

        <h1>Tier 1 — Personal scan</h1>

        <p className="lede">Authorized scanning only. Results persist to local SQLite.</p>
      </header>

      <section className="panel scan-form">
        <label>
          Targets (IP, CIDR, or hostname)
          <input
            value={targets}
            onChange={(e) => {
              setTargets(e.target.value);
            }}
            disabled={running}
          />
        </label>

        <label>
          Intensity
          <select
            value={intensity}
            onChange={(e) => {
              setIntensity(e.target.value as ScanIntensity);
            }}
            disabled={running}
          >
            <option value="light">light</option>

            <option value="standard">standard</option>

            <option value="deep">deep</option>
          </select>
        </label>

        <label className="checkbox">
          <input
            type="checkbox"
            checked={consented}
            onChange={(e) => {
              setConsented(e.target.checked);
            }}
            disabled={running}
          />

          {CONSENT}
        </label>

        <label className="checkbox">
          <input
            type="checkbox"
            checked={useFixture}
            onChange={(e) => {
              setUseFixture(e.target.checked);
            }}
            disabled={running}
          />
          Use lab fixture (no live nmap required)
        </label>

        <label className="checkbox">
          <input
            type="checkbox"
            checked={allowPrivateOverride}
            onChange={(e) => {
              setAllowPrivateOverride(e.target.checked);
            }}
            disabled={running}
          />
          Allow private/loopback targets (RFC1918 / 127.0.0.0/8)
        </label>

        <label className="checkbox">
          <input
            type="checkbox"
            checked={allowFixtureFallback}
            onChange={(e) => {
              setAllowFixtureFallback(e.target.checked);
            }}
            disabled={running || useFixture}
          />
          Allow fixture fallback if live nmap fails (never silent)
        </label>

        <button type="button" onClick={() => void handleScan()} disabled={running || !consented}>
          {running ? 'Scanning…' : 'Run scan'}
        </button>

        {progress !== null && <p className="progress">{progress}</p>}

        {error !== null && <p className="error">{error}</p>}
      </section>

      {scanRun !== null && (
        <>
          <section className="panel">
            <div className="sync-row">
              <button type="button" onClick={() => void handleSync()}>
                Sync to cloud dashboard
              </button>

              {syncStatus !== null && <p className="progress">{syncStatus}</p>}
            </div>

            <h2>Topology ({scanRun.hosts.length} hosts)</h2>

            <Suspense fallback={<p>Loading topology graph…</p>}>
              <TopologyGraph
                hosts={scanRun.hosts}
                findings={scanRun.findings}
                selectedHostIp={selectedHostIp}
                onSelectHost={(ip) => {
                  setSelectedHostIp(ip);
                }}
                width={720}
                height={360}
              />
            </Suspense>
          </section>

          <section className="panel grid-two">
            <div>
              <h2>Findings ({scanRun.findings.length})</h2>

              <ul className="findings-list">
                {scanRun.findings.map((f) => (
                  <li key={f.id} className={`sev-${f.severity}`}>
                    <strong>{f.title}</strong> — {f.hostIp}
                    {f.port !== undefined ? `:${String(f.port)}` : ''} (risk {String(f.riskScore)})
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h2>Host detail</h2>

              {selectedHost !== undefined ? (
                <>
                  <p>
                    <strong>{selectedHost.hostname ?? selectedHost.ip}</strong> ({selectedHost.ip})
                  </p>

                  {selectedHost.os !== undefined && <p>OS: {selectedHost.os}</p>}

                  <h3>Services</h3>

                  <ul>
                    {selectedHost.services.map((s) => (
                      <li key={`${s.protocol}-${String(s.port)}`}>
                        {String(s.port)}/{s.protocol} {s.product ?? ''} {s.version ?? ''}
                      </li>
                    ))}
                  </ul>

                  <h3>Findings</h3>

                  <ul>
                    {selectedFindings.map((f) => (
                      <li key={f.id}>{f.title}</li>
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

      <footer className="footer">
        <small>Detection only — no exploit execution.</small>
      </footer>
    </main>
  );
}

export function App() {
  return (
    <RootErrorBoundary>
      <DesktopApp />
    </RootErrorBoundary>
  );
}
