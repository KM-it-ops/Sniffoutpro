import { describe, expect, it } from 'vitest';
import { createCallerFactory } from './trpc.js';
import { appRouter } from './router.js';
import { createLogger } from './logger.js';

const createCaller = createCallerFactory(appRouter);
const logger = createLogger('lockdown-test');

const scanId = '33333333-3333-4333-8333-333333333333';

function anonymousCaller() {
  return createCaller({
    db: {} as never,
    logger,
    userId: null,
    tier: 'WORKSTATION',
    syncAuthorized: true,
  });
}

describe('cloud data requires a signed-in user', () => {
  it('rejects scan list, detail, diff, hosts, and findings for a null user', async () => {
    const caller = anonymousCaller();

    await expect(caller.scans.list()).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    await expect(caller.scans.getDetail({ id: scanId })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
    await expect(
      caller.scans.diff({ baseScanId: scanId, compareScanId: scanId }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    await expect(caller.hosts.list({ scanRunId: scanId })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
    await expect(caller.findings.list({ scanRunId: scanId })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  it('rejects scans.sync for a null user even when the shared secret would authorize sync', async () => {
    const caller = anonymousCaller();

    await expect(
      caller.scans.sync({
        consentText: 'test',
        scanRun: {
          id: scanId,
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

  it('rejects auth.me without userId', async () => {
    const caller = anonymousCaller();
    await expect(caller.auth.me()).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });
});
