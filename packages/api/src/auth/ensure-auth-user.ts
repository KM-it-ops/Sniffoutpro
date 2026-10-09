import { and, eq, ne } from 'drizzle-orm';
import { users } from '@sniffoutpro/db/schema';
import type { Database } from '@sniffoutpro/db';

export async function ensureAuthUser(
  db: Database,
  user: { id: string; email: string },
): Promise<void> {
  await db.transaction(async (tx) => {
    // The email now belongs to this account: an older row holding it keeps its data but loses the email.
    await tx
      .update(users)
      .set({ email: null })
      .where(and(eq(users.email, user.email), ne(users.id, user.id)));
    await tx
      .insert(users)
      .values({ id: user.id, email: user.email })
      .onConflictDoNothing({ target: users.id });
  });
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
