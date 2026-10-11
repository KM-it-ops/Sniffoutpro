import { describe, expect, it } from 'vitest';
import type { Database } from '@sniffoutpro/db';
import { rememberSignedInUser } from './ensure-auth-user.js';

const USER = '11111111-1111-4111-8111-111111111111';

function recordingDb(): { db: Database; rows: { id: string; email: string }[] } {
  const rows: { id: string; email: string }[] = [];
  const db = {
    update: () => ({ set: () => ({ where: () => Promise.resolve() }) }),
    transaction: (fn: (tx: unknown) => Promise<void>) => fn(db),
    insert: () => ({
      values: (row: { id: string; email: string }) => ({
        onConflictDoNothing: () => {
          rows.push(row);
          return Promise.resolve();
        },
      }),
    }),
  };
  return { db: db as unknown as Database, rows };
}

describe('rememberSignedInUser', () => {
  it('saves a signed-in person so the default tier can apply', async () => {
    const { db, rows } = recordingDb();
    await rememberSignedInUser(db, { id: USER, email: 'analyst@example.com' });
    expect(rows).toEqual([{ id: USER, email: 'analyst@example.com' }]);
  });

  it('does not save a session that has no email', async () => {
    const { db, rows } = recordingDb();
    await rememberSignedInUser(db, { id: USER, email: null });
    expect(rows).toEqual([]);
  });
});
