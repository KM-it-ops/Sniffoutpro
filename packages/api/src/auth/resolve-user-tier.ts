import { eq } from 'drizzle-orm';
import type { Database } from '@sniffoutpro/db';
import { users } from '@sniffoutpro/db/schema';
import { TierEnum, type Tier } from '@sniffoutpro/types';

export async function resolveUserTier(db: Database, userId: string | null): Promise<Tier> {
  if (userId === null) {
    return 'PERSONAL';
  }

  const rows = await db
    .select({ tier: users.tier })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const parsed = TierEnum.safeParse(rows[0]?.tier);
  return parsed.success ? parsed.data : 'PERSONAL';
}
