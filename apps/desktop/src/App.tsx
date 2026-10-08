import { lazy, Suspense, useState } from 'react';

import type { Finding, Host, ScanIntensity, ScanRun } from '@sniffoutpro/types';

import { getCloudAccessToken } from './lib/cloud-session';
import {
  minuteInterval,
  runDueJobs,
  scheduledScanRequest,
  type ScheduledJob,
} from './lib/poll-schedules';
import { runDesktopScan } from './lib/run-scan';
import {
  listCloudSchedules,
  loadStoredConsent,
  recordCloudScheduleRun,
  saveCloudSchedule,
  scheduleTargets,
  setCloudScheduleEnabled,
  updateCloudSchedule,
} from './lib/schedule-client';
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

  const [cloudEmail, setCloudEmail] = useState('');

  const [cloudPassword, setCloudPassword] = useState('');

  const [scheduleMinutes, setScheduleMinutes] = useState('60');

  const [scheduleStatus, setScheduleStatus] = useState<string | null>(null);

  const [savedSchedules, setSavedSchedules] = useState<ScheduledJob[] | null>(null);

  const selectedHost: Host | undefined = scanRun?.hosts.find((h) => h.ip === selectedHostIp);

  const selectedFindings: Finding[] =
    scanRun?.findings.filter((f) => f.hostIp === selectedHostIp) ?? [];

  async function handleSaveSchedule(): Promise<void> {
    if (!consented) {
      setScheduleStatus('Authorization consent is required before saving a schedule.');
      return;
    }
    const parsed = scheduleTargets(targets);
    const minutes = minuteInterval(scheduleMinutes);
    if (parsed.length === 0 || minutes === null) {
      setScheduleStatus('Enter a target and a whole number of minutes, at least 1.');
      return;
    }
    const accessToken = await getCloudAccessToken();
    if (accessToken === null) {
      setScheduleStatus('Sign in before saving a schedule.');
      return;
    }
    try {
      await saveCloudSchedule(accessToken, {
        cron: minutes,
        targets: parsed,
        intensity,
      });
      setScheduleStatus(
        'Schedule saved. It runs here after a scan has stored consent for these targets.',
      );
      setSavedSchedules(null);
    } catch (caught) {
      setScheduleStatus(
        caught instanceof Error ? caught.message : 'The schedule could not be saved.',
      );
    }
  }

  async function handleLoadSchedules(): Promise<void> {
    const accessToken = await getCloudAccessToken();
    if (accessToken === null) {
      setScheduleStatus('Sign in before loading schedules.');
      return;
    }
    try {
      const jobs = await listCloudSchedules(accessToken);
      setSavedSchedules(jobs);
      setScheduleStatus(jobs.length === 0 ? 'No schedules saved.' : null);
    } catch (caught) {
      setScheduleStatus(
        caught instanceof Error ? caught.message : 'Schedules could not be loaded.',
      );
    }
  }

  async function handleUpdateSchedule(id: string): Promise<void> {
    if (!consented) {
      setScheduleStatus('Authorization consent is required before updating a schedule.');
      return;
    }
    const parsed = scheduleTargets(targets);
    const minutes = minuteInterval(scheduleMinutes);
    if (parsed.length === 0 || minutes === null) {
      setScheduleStatus('Enter a target and a whole number of minutes, at least 1.');
      return;
    }
    const accessToken = await getCloudAccessToken();
    if (accessToken === null) {
      setScheduleStatus('Sign in before updating a schedule.');
      return;
    }
    try {
      const updated = await updateCloudSchedule(accessToken, {
        id,
        cron: minutes,
        targets: parsed,
        intensity,
      });
      setSavedSchedules((current) =>
        current === null
          ? null
          : current.map((item) =>
              item.id === id
                ? {
                    ...item,
                    cron: minutes,
                    targets: parsed,
                    intensity,
                    nextRunAt: updated.nextRunAt,
                  }
                : item,
            ),
      );
      setScheduleStatus('Schedule updated.');
    } catch (caught) {
      setScheduleStatus(
        caught instanceof Error ? caught.message : 'The schedule could not be updated.',
      );
    }
  }

  async function handleTurnOn(id: string): Promise<void> {
    const accessToken = await getCloudAccessToken();
    if (accessToken === null) {
      setScheduleStatus('Sign in before turning on a schedule.');
      return;
    }
    try {
      await setCloudScheduleEnabled(accessToken, id, true);
      setSavedSchedules((current) =>
        current === null
          ? null
          : current.map((job) => (job.id === id ? { ...job, enabled: true } : job)),
      );
      setScheduleStatus('Schedule turned on.');
    } catch (caught) {
      setScheduleStatus(
        caught instanceof Error ? caught.message : 'The schedule could not be turned on.',
      );
    }
  }

  async function handleTurnOff(id: string): Promise<void> {
    const accessToken = await getCloudAccessToken();
    if (accessToken === null) {
      setScheduleStatus('Sign in before turning off a schedule.');
      return;
    }
    try {
      await setCloudScheduleEnabled(accessToken, id, false);
      setSavedSchedules((current) =>
        current === null
          ? null
          : current.map((job) => (job.id === id ? { ...job, enabled: false } : job)),
      );
      setScheduleStatus('Schedule turned off.');
    } catch (caught) {
      setScheduleStatus(
        caught instanceof Error ? caught.message : 'The schedule could not be turned off.',
      );
    }
  }

  async function handleRunDueSchedules(): Promise<void> {
    const accessToken = await getCloudAccessToken();
    if (accessToken === null) {
      setScheduleStatus('Sign in before checking schedules.');
      return;
    }
    try {
      const jobs = await listCloudSchedules(accessToken);
      const scopes = await loadStoredConsent();
      const now = new Date();
      const result = await runDueJobs({
        jobs,
        scopes,
        now,
        run: async (job) => {
          await runDesktopScan(
            scheduledScanRequest(job, CONSENT, allowPrivateOverride),
            () => undefined,
          );
        },
        onRan: async (job, nextRunAt) => {
          if (nextRunAt !== null) {
            await recordCloudScheduleRun(accessToken, job.id, nextRunAt);
          }
        },
      });
      const failedNote =
        result.failed.length === 0
          ? ''
          : ` Failed: ${result.failed.map((item) => item.message).join(' ')}`;
      setScheduleStatus(
        `Schedules ran ${String(result.ran.length)}, skipped ${String(result.skipped.length)}, failed ${String(result.failed.length)}.${failedNote}`,
      );
    } catch (caught) {
      setScheduleStatus(caught instanceof Error ? caught.message : 'Schedules could not be run.');
    }
  }

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
      const { getCloudAccessToken } = await import('./lib/cloud-session');
      const { syncScanToCloud } = await import('./lib/sync-scan');
      const accessToken = await getCloudAccessToken();
      if (accessToken === null) {
        setSyncStatus('Sign in on this computer before syncing.');
        return;
      }

      await syncScanToCloud(scanRun, CONSENT, accessToken);

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

        <p className="lede">
          Authorized scanning only. No account is required. The first scan creates a database on
          this computer.
        </p>
      </header>

      <details className="panel">
        <summary>Several people, or a live website</summary>
        <p>
          One computer does not need Supabase. Set it up when more than one person should sign in,
          or when scans should leave this computer.
        </p>
        <ol>
          <li>Create a project at supabase.com and turn on email sign-in.</li>
          <li>
            Put the project URL and anon key in the website as NEXT_PUBLIC_SUPABASE_URL and
            NEXT_PUBLIC_SUPABASE_ANON_KEY, and the same pair as SUPABASE_URL and SUPABASE_ANON_KEY.
          </li>
          <li>
            Put that same URL and anon key in the desktop app as VITE_SUPABASE_URL and
            VITE_SUPABASE_ANON_KEY, and set VITE_WEB_URL to the website address.
          </li>
          <li>
            Set DATABASE_URL to the project database connection string, then apply the migrations
            with pnpm --filter @sniffoutpro/db db:migrate.
          </li>
          <li>Do not put the service role key in the desktop app or in a NEXT_PUBLIC value.</li>
        </ol>
      </details>

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

        <label>
          Repeat every (minutes)
          <input
            value={scheduleMinutes}
            onChange={(e) => {
              setScheduleMinutes(e.target.value);
            }}
            disabled={running}
          />
        </label>

        <button
          type="button"
          onClick={() => void handleSaveSchedule()}
          disabled={running || !consented}
        >
          Save schedule
        </button>

        <button type="button" onClick={() => void handleLoadSchedules()} disabled={running}>
          Load schedules
        </button>

        <button type="button" onClick={() => void handleRunDueSchedules()} disabled={running}>
          Run due schedules
        </button>

        {savedSchedules?.map((job) => (
          <div key={job.id}>
            {job.enabled ? (
              <>
                <button
                  type="button"
                  onClick={() => void handleUpdateSchedule(job.id)}
                  disabled={running}
                >
                  Update {job.targets.join(', ')}
                </button>
                <button type="button" onClick={() => void handleTurnOff(job.id)} disabled={running}>
                  Turn off {job.targets.join(', ')}
                </button>
              </>
            ) : (
              <button type="button" onClick={() => void handleTurnOn(job.id)} disabled={running}>
                Turn on {job.targets.join(', ')}
              </button>
            )}
          </div>
        ))}

        {scheduleStatus !== null && <p className="progress">{scheduleStatus}</p>}

        {progress !== null && <p className="progress">{progress}</p>}

        {error !== null && <p className="error">{error}</p>}
      </section>

      {scanRun !== null && (
        <>
          <section className="panel">
            <div className="sync-row">
              <label>
                Cloud email
                <input
                  type="email"
                  value={cloudEmail}
                  onChange={(e) => {
                    setCloudEmail(e.target.value);
                  }}
                />
              </label>
              <label>
                Cloud password
                <input
                  type="password"
                  value={cloudPassword}
                  onChange={(e) => {
                    setCloudPassword(e.target.value);
                  }}
                />
              </label>
              <button
                type="button"
                onClick={() => {
                  void (async () => {
                    const { signInToCloud } = await import('./lib/cloud-session');
                    const message = await signInToCloud(cloudEmail, cloudPassword);
                    setSyncStatus(message ?? 'Signed in. You can sync this scan.');
                  })();
                }}
              >
                Sign in to cloud
              </button>
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
