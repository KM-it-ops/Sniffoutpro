import { users } from '@sniffoutpro/db/schema';
import type { Database } from '@sniffoutpro/db';

export async function ensureAuthUser(
  db: Database,
  user: { id: string; email: string },
): Promise<void> {
  await db
    .insert(users)
    .values({ id: user.id, email: user.email })
    .onConflictDoNothing({ target: users.id });
}
