import { drizzle } from 'drizzle-orm/postgres-js';
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
