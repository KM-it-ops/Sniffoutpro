// Review reproduction tests for commit cf90d58 (temporary file; the permanent copy lives in the review record).
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDb, type Database } from '@sniffoutpro/db';
import { createLogger } from './logger.js';
import { appRouter } from './router.js';
import { createCallerFactory } from './trpc.js';

const createCaller = createCallerFactory(appRouter);
const logger = createLogger('review-test');
const USER = '11111111-1111-4111-8111-111111111111';
const ORG_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const here = dirname(fileURLToPath(import.meta.url));

const scanRun = {
  id: '22222222-2222-4222-8222-222222222222',
  status: 'completed' as const,
  targets: ['127.0.0.1'],
  intensity: 'light' as const,
  startedAt: '2026-10-08T12:00:00.000Z',
  completedAt: '2026-10-08T12:05:00.000Z',
  hosts: [],
  findings: [],
};

describe('lead 1: the API never runs queries as the restricted role', () => {
  it('sends a role switch or an org setting before reading scans', async () => {
    const db = createDb('postgresql://nobody:none@127.0.0.1:1/none');
    const seen: string[] = [];
    const client = (db as unknown as { $client: { unsafe: (q: string) => unknown } }).$client;
    vi.spyOn(client, 'unsafe').mockImplementation((query: string) => {
      seen.push(query);
      return Object.assign(Promise.resolve([]), { values: () => Promise.resolve([]) });
    });
    const caller = createCaller({
      db,
      logger,
      userId: USER,
      tier: 'WORKSTATION',
      syncAuthorized: true,
    });
    await caller.scans.list();
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.join('\n')).toMatch(/sniffout_member|sniffout\.org_id/);
  });

  it('has some non-test code that sets the restricted role', () => {
    const roots = [
      join(here, '../../db/src/client.ts'),
      join(here, 'context.ts'),
      join(here, '../../../apps/web/src/app/api/trpc/[trpc]/route.ts'),
      join(here, '../../../apps/web/src/lib/db.ts'),
    ];
    const text = roots.map((p) => readFileSync(p, 'utf8')).join('\n');
    expect(text).toMatch(/sniffout_member|sniffout\.org_id/);
  });
});

describe('lead 3: scans.sync requires the sync gate', () => {
  it('refuses a signed-in caller whose syncAuthorized is false', async () => {
    const caller = createCaller({
      db: {} as unknown as Database,
      logger,
      userId: USER,
      tier: 'WORKSTATION',
      syncAuthorized: false,
    });
    await expect(caller.scans.sync({ consentText: 'x', scanRun })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });
});

describe('extra: a viewer cannot sync (requirement R6, plan U8)', () => {
  it('refuses scans.sync for a viewer and writes nothing', async () => {
    const inserts: string[] = [];
    const tx = {
      insert: () => ({
        values: () => {
          inserts.push('insert');
          return Object.assign(Promise.resolve([]), { onConflictDoNothing: () => Promise.resolve([]) });
        },
      }),
    };
    const db = {
      select: () => ({
        from: () => ({
          where: () => Promise.resolve([{ orgId: ORG_A, role: 'viewer' }]),
        }),
      }),
      transaction: (fn: (t: typeof tx) => Promise<void>) => fn(tx),
    } as unknown as Database;
    const caller = createCaller({
      db,
      logger,
      userId: USER,
      tier: 'WORKSTATION',
      syncAuthorized: true,
    });
    await expect(caller.scans.sync({ consentText: 'x', scanRun })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    expect(inserts).toEqual([]);
  });
});
