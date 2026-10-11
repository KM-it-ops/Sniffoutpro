import { describe, expect, it } from 'vitest';
import type { Database } from '@sniffoutpro/db';
import type { Tier } from '@sniffoutpro/types';
import { createLogger } from '../logger.js';
import { appRouter } from '../router.js';
import { createCallerFactory } from '../trpc.js';
import { rowsInOrg } from './reports.js';
import { memberDb } from '../test-support/member-db.js';

const createCaller = createCallerFactory(appRouter);
const logger = createLogger('reports-clients-test');
const USER = '11111111-1111-4111-8111-111111111111';
const ORG_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ORG_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const CLIENT = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

function caller(db: Database, tier: Tier) {
  return createCaller({
    db: memberDb(db),
    logger,
    userId: USER,
    tier,
    syncAuthorized: false,
  });
}

function membershipDb(role: string) {
  let inserted: { orgId?: string; name?: string } | undefined;
  const db = {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve([{ orgId: ORG_A, role }]),
        }),
      }),
    }),
    insert: () => ({
      values: (value: { orgId: string; name: string }) => ({
        returning: () => {
          inserted = value;
          return Promise.resolve([{ id: CLIENT, ...value }]);
        },
      }),
    }),
  } as unknown as Database;
  return { db, read: () => inserted };
}

describe('report clients', () => {
  it('refuses a workstation user', async () => {
    const { db } = membershipDb('analyst');
    await expect(
      caller(db, 'WORKSTATION').reports.clients.create({ name: 'Acme Security' }),
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('saves a client in the caller organization', async () => {
    const { db, read } = membershipDb('analyst');
    const row = await caller(db, 'CONSULTANT').reports.clients.create({ name: 'Acme Security' });
    expect(row.name).toBe('Acme Security');
    expect(read()?.orgId).toBe(ORG_A);
  });

  it('refuses a viewer', async () => {
    const { db } = membershipDb('viewer');
    await expect(
      caller(db, 'CONSULTANT').reports.clients.create({ name: 'Acme Security' }),
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('lists only the caller organization', () => {
    const rows = rowsInOrg(
      [
        { id: CLIENT, orgId: ORG_A, name: 'Acme Security' },
        { id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', orgId: ORG_B, name: 'Other' },
      ],
      ORG_A,
    );
    expect(rows.map((row) => row.name)).toEqual(['Acme Security']);
  });

  it('refuses an update for another organization', async () => {
    let call = 0;
    const db = {
      select: () => ({
        from: () => ({
          where: () => ({
            limit: () => {
              call += 1;
              if (call === 1) {
                return Promise.resolve([{ orgId: ORG_A, role: 'analyst' }]);
              }
              return Promise.resolve([{ id: CLIENT, orgId: ORG_B }]);
            },
          }),
        }),
      }),
      update: () => {
        throw new Error('other organization must not be updated');
      },
    } as unknown as Database;

    await expect(
      caller(db, 'CONSULTANT').reports.clients.update({ id: CLIENT, name: 'Changed' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});
