import { sql } from 'drizzle-orm';
import type { PgDatabase } from 'drizzle-orm/pg-core';
import { drizzle, type PostgresJsQueryResultHKT } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema/index.js';

export function createDb(connectionString: string) {
  const client = postgres(connectionString, {
    max: 1,
    prepare: false,
  });
  const db = drizzle(client, { schema });

  return Object.assign(db, {
    close: async (): Promise<void> => {
      await client.end();
    },
  });
}

export type Database = ReturnType<typeof createDb>;

/** Either the database itself or an open transaction on it; both run the same queries. */
export type Queryable = PgDatabase<PostgresJsQueryResultHKT, typeof schema>;

/**
 * Run `work` in one transaction as the restricted role `sniffout_member`, acting for `userId`.
 * Row security (migration 0008) then limits every query to that person's own rows and the
 * organizations where they hold an active membership. Both settings end with the transaction.
 */
export async function withMemberRole<T>(
  db: Queryable,
  userId: string,
  work: (tx: Queryable) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`set local role sniffout_member`);
    await tx.execute(sql`select set_config('sniffout.user_id', ${userId}, true)`);
    return work(tx);
  });
}
