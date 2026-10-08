import { describe, expect, it } from 'vitest';
import type { Database } from '@sniffoutpro/db';
import { resolveUserTier } from './resolve-user-tier.js';

function dbWithTier(tier: string | null) {
  return {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve(tier === null ? [] : [{ tier }]),
        }),
      }),
    }),
  } as unknown as Database;
}

describe('resolveUserTier', () => {
  it('stays personal when there is no session', async () => {
    await expect(resolveUserTier(dbWithTier('WORKSTATION'), null)).resolves.toBe('PERSONAL');
  });

  it('does not treat a missing user row as workstation', async () => {
    await expect(
      resolveUserTier(dbWithTier(null), '11111111-1111-4111-8111-111111111111'),
    ).resolves.toBe('PERSONAL');
  });

  it('uses the tier stored on the user row', async () => {
    await expect(
      resolveUserTier(dbWithTier('CONSULTANT'), '11111111-1111-4111-8111-111111111111'),
    ).resolves.toBe('CONSULTANT');
  });
});
