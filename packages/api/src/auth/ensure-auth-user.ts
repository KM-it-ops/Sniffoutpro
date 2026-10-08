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

export async function rememberSignedInUser(
  db: Database,
  user: { id: string; email: string | null },
): Promise<void> {
  if (user.email === null || user.email === '') {
    return;
  }
  await ensureAuthUser(db, { id: user.id, email: user.email });
}
