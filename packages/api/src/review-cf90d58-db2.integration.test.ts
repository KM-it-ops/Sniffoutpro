// Review reproduction tests for commit cf90d58 (temporary; permanent copy lives in the review record).
import { eq, inArray } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { createDb } from '@sniffoutpro/db';
import { authorizationScopes, scanRuns, users } from '@sniffoutpro/db/schema';
import { ensureAuthUser } from './auth/ensure-auth-user.js';
import { createLogger } from './logger.js';
import { appRouter } from './router.js';
import { createCallerFactory } from './trpc.js';

const URL = process.env['DATABASE_URL'] ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const db = createDb(URL);
const createCaller = createCallerFactory(appRouter);
const logger = createLogger('review-db2-test');
const U1 = 'e5555555-5555-4555-8555-555555555555';
const U2 = 'f6666666-6666-4666-8666-666666666666';
const U3 = 'a7777777-7777-4777-8777-777777777777';
const SCAN = 'b8888888-8888-4888-8888-888888888888';
const run = (id: string) => ({
  id,
  status: 'completed' as const,
  targets: ['10.9.9.9'],
  intensity: 'light' as const,
  startedAt: '2026-10-08T12:00:00.000Z',
  completedAt: '2026-10-08T12:05:00.000Z',
  hosts: [],
  findings: [],
});

afterAll(async () => {
  await db.delete(scanRuns).where(eq(scanRuns.id, SCAN));
  await db.delete(authorizationScopes).where(inArray(authorizationScopes.userId, [U1, U2]));
  await db.delete(users).where(inArray(users.id, [U1, U2, U3]));
  await db.close();
});

describe('email clash', () => {
  it('does not throw when a different id arrives with an email already stored', async () => {
    await ensureAuthUser(db, { id: U1, email: 'rv-clash@example.test' });
    await expect(
      ensureAuthUser(db, { id: U3, email: 'rv-clash@example.test' }),
    ).resolves.toBeUndefined();
  });
});

describe('id reuse across people', () => {
  it('does not reveal a raw database error when a scan id is already taken', async () => {
    await db.insert(users).values([{ id: U2, email: 'rv-u2@example.test' }]);
    const as = (userId: string) =>
      createCaller({ db, logger, userId, tier: 'WORKSTATION', syncAuthorized: true });
    await as(U1).scans.sync({ consentText: 'lab', scanRun: run(SCAN) });
    const err = await as(U2)
      .scans.sync({ consentText: 'lab', scanRun: run(SCAN) })
      .then(() => null, (e: unknown) => e as Error);
    expect(err).not.toBeNull();
    expect(String(err?.message)).not.toMatch(/duplicate key|scan_runs_pkey|violates|Failed query/i);
  });
});
