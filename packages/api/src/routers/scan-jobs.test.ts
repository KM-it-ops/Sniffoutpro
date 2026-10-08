import { describe, expect, it } from 'vitest';
import type { Database } from '@sniffoutpro/db';
import type { Tier } from '@sniffoutpro/types';
import { createLogger } from '../logger.js';
import { appRouter } from '../router.js';
import { createCallerFactory } from '../trpc.js';
import { jobsForUser } from './scan-jobs.js';

const createCaller = createCallerFactory(appRouter);
const logger = createLogger('scan-jobs-test');
const OWNER = '66666666-6666-4666-8666-666666666666';
const OTHER = '77777777-7777-4777-8777-777777777777';
const ORG_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ORG_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const JOB = '88888888-8888-4888-8888-888888888888';

type JobRow = {
  id: string;
  userId: string | null;
  orgId: string | null;
  cron: string;
  targets: string[];
  intensity: 'light' | 'standard' | 'deep';
  enabled: boolean;
  nextRunAt: Date | null;
  createdAt: Date;
};

function jobsDatabase(seed: JobRow[], role = 'analyst') {
  const rows = [...seed];
  const patches: Array<Record<string, unknown>> = [];
  const db = {
    insert: () => ({
      values: (value: Omit<JobRow, 'id' | 'createdAt'>) => ({
        returning: () => {
          const row: JobRow = {
            ...value,
            id: '88888888-8888-4888-8888-888888888888',
            createdAt: new Date('2026-10-08T12:00:00.000Z'),
          };
          rows.push(row);
          return Promise.resolve([row]);
        },
      }),
    }),
    select: () => ({
      from: () => ({
        where: () =>
          Object.assign(Promise.resolve(rows), {
            limit: () => Promise.resolve([{ orgId: ORG_A, role }]),
          }),
      }),
    }),
    update: () => ({
      set: (value: Record<string, unknown>) => ({
        where: () => {
          patches.push(value);
          return Promise.resolve([]);
        },
      }),
    }),
  } as unknown as Database;
  return { db, rows, patches };
}

function caller(db: Database, tier: Tier, userId: string) {
  return createCaller({
    db,
    logger,
    userId,
    tier,
    syncAuthorized: false,
  });
}

describe('scan jobs', () => {
  it('refuses a schedule when the tier has no schedules feature', async () => {
    const { db } = jobsDatabase([]);
    await expect(
      caller(db, 'PERSONAL', OWNER).scanJobs.create({
        cron: '60',
        targets: ['127.0.0.1'],
        intensity: 'light',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('refuses an interval that is not a whole number of minutes', async () => {
    const { db } = jobsDatabase([]);
    await expect(
      caller(db, 'WORKSTATION', OWNER).scanJobs.create({
        cron: 'every hour',
        targets: ['127.0.0.1'],
        intensity: 'light',
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('refuses a viewer', async () => {
    const { db } = jobsDatabase([], 'viewer');
    await expect(
      caller(db, 'WORKSTATION', OWNER).scanJobs.create({
        cron: '60',
        targets: ['127.0.0.1'],
        intensity: 'light',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('lists only the signed-in caller jobs', async () => {
    const { db, rows } = jobsDatabase([
      {
        id: '99999999-9999-4999-8999-999999999999',
        userId: OTHER,
        orgId: null,
        cron: '60',
        targets: ['10.0.0.1'],
        intensity: 'light',
        enabled: true,
        nextRunAt: null,
        createdAt: new Date(),
      },
    ]);
    await caller(db, 'WORKSTATION', OWNER).scanJobs.create({
      cron: '60',
      targets: ['127.0.0.1'],
      intensity: 'light',
    });
    const listed = await caller(db, 'WORKSTATION', OWNER).scanJobs.list();
    expect(listed.map((row) => row.userId)).toEqual([OWNER]);
    expect(jobsForUser(listed, OTHER)).toEqual([]);
    expect(rows.find((row) => row.userId === OWNER)?.orgId).toBe(ORG_A);
  });

  it('updates the caller schedule', async () => {
    const { db, patches } = jobsDatabase([
      {
        id: JOB,
        userId: OWNER,
        orgId: ORG_A,
        cron: '60',
        targets: ['127.0.0.1'],
        intensity: 'light',
        enabled: true,
        nextRunAt: null,
        createdAt: new Date(),
      },
    ]);
    const updated = await caller(db, 'WORKSTATION', OWNER).scanJobs.update({
      id: JOB,
      cron: '120',
      targets: ['127.0.0.2'],
      intensity: 'deep',
    });
    expect(updated.targets).toEqual(['127.0.0.2']);
    expect(patches[0]).toMatchObject({ cron: '120', intensity: 'deep' });
    const nextRunAt = patches[0]?.['nextRunAt'];
    expect(nextRunAt).toBeInstanceOf(Date);
    const waitMs = nextRunAt instanceof Date ? nextRunAt.getTime() - Date.now() : 0;
    expect(waitMs).toBeGreaterThan(119 * 60_000);
    expect(waitMs).toBeLessThan(121 * 60_000);
  });

  it('refuses an update for another organization', async () => {
    const { db, patches } = jobsDatabase([
      {
        id: JOB,
        userId: OWNER,
        orgId: ORG_B,
        cron: '60',
        targets: ['10.0.0.1'],
        intensity: 'light',
        enabled: true,
        nextRunAt: null,
        createdAt: new Date(),
      },
    ]);
    await expect(
      caller(db, 'WORKSTATION', OWNER).scanJobs.update({
        id: JOB,
        cron: '120',
        targets: ['127.0.0.2'],
        intensity: 'deep',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(patches).toEqual([]);
  });

  it('records the next run for the caller schedule', async () => {
    const { db, patches } = jobsDatabase([
      {
        id: JOB,
        userId: OWNER,
        orgId: ORG_A,
        cron: '60',
        targets: ['127.0.0.1'],
        intensity: 'light',
        enabled: true,
        nextRunAt: null,
        createdAt: new Date(),
      },
    ]);
    const result = await caller(db, 'WORKSTATION', OWNER).scanJobs.recordRun({
      id: JOB,
      nextRunAt: '2026-10-08T13:00:00.000Z',
    });
    expect(result.nextRunAt).toBe('2026-10-08T13:00:00.000Z');
    const saved = patches[0]?.['nextRunAt'];
    expect(saved instanceof Date ? saved.toISOString() : null).toBe('2026-10-08T13:00:00.000Z');
  });
});
