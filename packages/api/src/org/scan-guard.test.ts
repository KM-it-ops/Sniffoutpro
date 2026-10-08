import { describe, expect, it } from 'vitest';
import type { Database } from '@sniffoutpro/db';
import { assertScanInCallerOrg } from './scan-guard.js';

const ORG_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ORG_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const SCAN = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const USER = '11111111-1111-4111-8111-111111111111';

function dbFor(scanOrgId: string | null | undefined) {
  let call = 0;
  return {
    select: () => ({
      from: () => ({
        where: () => {
          call += 1;
          if (call === 1) {
            return Promise.resolve([{ orgId: ORG_A }]);
          }
          const rows = scanOrgId === undefined ? [] : [{ orgId: scanOrgId }];
          return { limit: () => Promise.resolve(rows) };
        },
      }),
    }),
  } as unknown as Database;
}

describe('assertScanInCallerOrg', () => {
  it('refuses a scan from another organization', async () => {
    await expect(assertScanInCallerOrg(dbFor(ORG_B), USER, SCAN)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('allows a scan in the caller organization', async () => {
    await expect(assertScanInCallerOrg(dbFor(ORG_A), USER, SCAN)).resolves.toBe('ok');
  });

  it('allows a scan the caller uploaded before joining an organization', async () => {
    await expect(assertScanInCallerOrg(personalDb(USER), USER, SCAN)).resolves.toBe('ok');
  });

  it('refuses a personal scan uploaded by someone else', async () => {
    await expect(
      assertScanInCallerOrg(personalDb('22222222-2222-4222-8222-222222222222'), USER, SCAN),
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });
});

function personalDb(scopeUserId: string) {
  let call = 0;
  return {
    select: () => ({
      from: () => ({
        where: () => {
          call += 1;
          if (call === 1) {
            return Promise.resolve([]);
          }
          if (call === 2) {
            return {
              limit: () => Promise.resolve([{ orgId: null, authorizationScopeId: 'scope-1' }]),
            };
          }
          return { limit: () => Promise.resolve([{ userId: scopeUserId }]) };
        },
      }),
    }),
  } as unknown as Database;
}
