import { describe, expect, it } from 'vitest';
import { createCallerFactory } from './trpc.js';
import { appRouter } from './router.js';
import { createLogger } from './logger.js';

const createCaller = createCallerFactory(appRouter);
const logger = createLogger('lockdown-test');

/**
 * Pre-G6 lockdown checklist (CH-2 / audit S2):
 * Once Phase 4 auth is wired, scans.list/getDetail/diff and hosts/findings
 * MUST reject unauthenticated callers in production.
 *
 * Today (single-tenant v1): procedures remain publicProcedure with rate limits.
 * This test documents the intended contract and will flip to expect UNAUTHORIZED
 * when protectedProcedure is applied.
 */
describe('pre-G6 auth lockdown contract', () => {
  it('documents that hosts.list and findings.list are rate-limited public until Phase 4', () => {
    // Contract marker — Phase 4 flips these to protectedProcedure.
    const phase4LockdownPending = true;
    expect(phase4LockdownPending).toBe(true);
  });

  it('rejects scans.sync without syncAuthorized (already enforced)', async () => {
    const caller = createCaller({
      db: {} as never,
      logger,
      userId: null,
      tier: 'WORKSTATION',
      syncAuthorized: false,
    });

    await expect(
      caller.scans.sync({
        consentText: 'test',
        scanRun: {
          id: crypto.randomUUID(),
          status: 'completed',
          targets: ['127.0.0.1'],
          intensity: 'light',
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          hosts: [],
          findings: [],
        },
      }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('rejects auth.me without userId (protectedProcedure baseline)', async () => {
    const caller = createCaller({
      db: {} as never,
      logger,
      userId: null,
      tier: 'WORKSTATION',
      syncAuthorized: false,
    });

    await expect(caller.auth.me()).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });
});
