import { describe, expect, it } from 'vitest';
import type { Database } from '@sniffoutpro/db';
import { createLogger } from '../logger.js';
import { appRouter } from '../router.js';
import { createCallerFactory } from '../trpc.js';
import { memberDb } from '../test-support/member-db.js';

const createCaller = createCallerFactory(appRouter);
const logger = createLogger('organizations-test');
const ADMIN = '11111111-1111-4111-8111-111111111111';
const INVITEE = '22222222-2222-4222-8222-222222222222';
const ORG_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function inviteDb(callerRole: string, existingMember = false) {
  let inserted: { orgId: string; userId: string; role: string } | undefined;
  let updatedRole: string | undefined;
  let call = 0;
  const db = {
    // The invitee lookup (sniffout_invitee_id).
    execute: () => Promise.resolve([{ id: INVITEE }]),
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => {
            call += 1;
            if (call === 1) {
              return Promise.resolve([{ role: callerRole }]);
            }
            return Promise.resolve(existingMember ? [{ id: 'membership-1' }] : []);
          },
        }),
      }),
    }),
    insert: () => ({
      values: (value: { orgId: string; userId: string; role: string }) => {
        inserted = value;
        return Promise.resolve();
      },
    }),
    update: () => ({
      set: (value: { role: string }) => ({
        where: () => {
          updatedRole = value.role;
          return Promise.resolve();
        },
      }),
    }),
  } as unknown as Database;
  return {
    db,
    read: () => inserted,
    updated: () => updatedRole,
  };
}

function caller(db: Database, userId: string) {
  return createCaller({
    db: memberDb(db),
    logger,
    userId,
    tier: 'ADMIN',
    syncAuthorized: false,
  });
}

describe('organization create', () => {
  it('refuses a short name that is already used', async () => {
    let inserted = false;
    const db = {
      select: () => ({
        from: () => ({
          where: () => ({
            limit: () => Promise.resolve([{ id: ORG_A }]),
          }),
        }),
      }),
      insert: () => {
        inserted = true;
        return { values: () => ({ returning: () => Promise.resolve([]) }) };
      },
    } as unknown as Database;
    await expect(
      caller(db, ADMIN).organizations.create({ name: 'Acme Security', slug: 'acme-security' }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(inserted).toBe(false);
  });
});

describe('organization invite', () => {
  it('refuses an analyst', async () => {
    const { db, read } = inviteDb('analyst');
    await expect(
      caller(db, ADMIN).organizations.invite({
        orgId: ORG_A,
        email: 'analyst@example.com',
        role: 'analyst',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(read()).toBeUndefined();
  });

  it('lets an admin invite an analyst into that organization', async () => {
    const { db, read } = inviteDb('admin');
    const result = await caller(db, ADMIN).organizations.invite({
      orgId: ORG_A,
      email: 'analyst@example.com',
      role: 'analyst',
    });
    expect(result).toEqual({ orgId: ORG_A, role: 'analyst', updated: false });
    expect(read()).toEqual({ orgId: ORG_A, userId: INVITEE, role: 'analyst', status: 'pending' });
  });

  it('changes the role when that person is already a member', async () => {
    const { db, read, updated } = inviteDb('admin', true);
    const result = await caller(db, ADMIN).organizations.invite({
      orgId: ORG_A,
      email: 'analyst@example.com',
      role: 'analyst',
    });
    expect(result).toMatchObject({ role: 'analyst', updated: true });
    expect(read()).toBeUndefined();
    expect(updated()).toBe('analyst');
  });

  it('refuses demoting the only admin', async () => {
    let updated = false;
    let call = 0;
    const db = {
      // The invitee lookup (sniffout_invitee_id).
      execute: () => Promise.resolve([{ id: ADMIN }]),
      select: () => ({
        from: () => ({
          where: () => ({
            limit: () => {
              call += 1;
              if (call === 1) {
                return Promise.resolve([{ role: 'admin' }]);
              }
              if (call === 2) {
                return Promise.resolve([{ id: 'membership-1', role: 'admin' }]);
              }
              return Promise.resolve([{ userId: ADMIN }]);
            },
          }),
        }),
      }),
      update: () => ({
        set: () => ({
          where: () => {
            updated = true;
            return Promise.resolve();
          },
        }),
      }),
    } as unknown as Database;
    await expect(
      caller(db, ADMIN).organizations.invite({
        orgId: ORG_A,
        email: 'admin@example.com',
        role: 'viewer',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(updated).toBe(false);
  });
});

describe('organization setRole', () => {
  it('refuses demoting the only admin', async () => {
    let updated = false;
    let call = 0;
    const db = {
      select: () => ({
        from: () => ({
          where: () => ({
            limit: () => {
              call += 1;
              if (call === 1) {
                return Promise.resolve([{ role: 'admin' }]);
              }
              if (call === 2) {
                return Promise.resolve([{ role: 'admin' }]);
              }
              return Promise.resolve([{ userId: ADMIN }]);
            },
          }),
        }),
      }),
      update: () => ({
        set: () => ({
          where: () => {
            updated = true;
            return Promise.resolve();
          },
        }),
      }),
    } as unknown as Database;
    await expect(
      caller(db, ADMIN).organizations.setRole({
        orgId: ORG_A,
        userId: ADMIN,
        role: 'viewer',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(updated).toBe(false);
  });
});
