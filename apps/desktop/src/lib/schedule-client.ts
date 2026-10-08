import { createTRPCClient, httpBatchLink } from '@trpc/client';
import { BaseDirectory, readFile } from '@tauri-apps/plugin-fs';
import superjson from 'superjson';
import type { AppRouter } from '@sniffoutpro/api';
import { sqliteAuthorizationScopes } from '@sniffoutpro/db';
import { createLocalDb } from './local-db';
import type { ScheduledJob, StoredConsent } from './poll-schedules';

function getWebUrl(): string {
  const url: unknown = import.meta.env['VITE_WEB_URL'];
  return typeof url === 'string' ? url : 'http://localhost:3000';
}

export function scheduleTargets(value: string): string[] {
  return value
    .split(/[\s,]+/)
    .map((target) => target.trim())
    .filter((target) => target.length > 0);
}

function cloudClient(accessToken: string) {
  return createTRPCClient<AppRouter>({
    links: [
      httpBatchLink({
        url: `${getWebUrl()}/api/trpc`,
        transformer: superjson,
        headers: () => ({ authorization: `Bearer ${accessToken}` }),
      }),
    ],
  });
}

export async function saveCloudSchedule(
  accessToken: string,
  input: { cron: string; targets: string[]; intensity: 'light' | 'standard' | 'deep' },
): Promise<void> {
  const row = await cloudClient(accessToken).scanJobs.create.mutate(input);
  if (row === undefined) {
    throw new Error('The schedule could not be saved.');
  }
}

export async function recordCloudScheduleRun(
  accessToken: string,
  id: string,
  nextRunAt: Date,
): Promise<void> {
  await cloudClient(accessToken).scanJobs.recordRun.mutate({
    id,
    nextRunAt: nextRunAt.toISOString(),
  });
}

export async function updateCloudSchedule(
  accessToken: string,
  input: { id: string; cron: string; targets: string[]; intensity: 'light' | 'standard' | 'deep' },
): Promise<{ nextRunAt: string }> {
  const row = await cloudClient(accessToken).scanJobs.update.mutate(input);
  return { nextRunAt: row.nextRunAt };
}

export async function setCloudScheduleEnabled(
  accessToken: string,
  id: string,
  enabled: boolean,
): Promise<void> {
  await cloudClient(accessToken).scanJobs.setEnabled.mutate({ id, enabled });
}

export async function listCloudSchedules(accessToken: string): Promise<ScheduledJob[]> {
  const client = cloudClient(accessToken);
  const rows = await client.scanJobs.list.query();
  return rows.map((row) => ({
    id: row.id,
    cron: row.cron,
    targets: row.targets,
    intensity: row.intensity,
    enabled: row.enabled,
    nextRunAt: row.nextRunAt === null ? null : new Date(row.nextRunAt).toISOString(),
  }));
}

export async function loadStoredConsent(): Promise<StoredConsent[]> {
  let bytes: Uint8Array | undefined;
  try {
    bytes = await readFile('sniffoutpro-tier1.db', { baseDir: BaseDirectory.AppData });
  } catch {
    bytes = undefined;
  }
  const db = await createLocalDb(bytes);
  db.migrate();
  const rows = db.select().from(sqliteAuthorizationScopes).all();
  db.close();
  return rows.map((row) => ({ targets: row.targets }));
}
