import type { Queryable } from '@sniffoutpro/db';

/**
 * Lets a hand-made fake database stand in for the real one now that every signed-in request
 * runs inside `withMemberRole`: the transaction hands back the same fake, and the role switch
 * and user setting (raw `execute` calls) are accepted and ignored unless the fake defines its own.
 */
export function memberDb(fake: object): Queryable {
  const own = fake as { execute?: unknown };
  const wrapped: object = Object.assign(Object.create(fake) as object, {
    transaction: async (work: (tx: unknown) => Promise<unknown>) => work(wrapped),
    execute: async (query: unknown) => {
      if (typeof own.execute === 'function') {
        return (own.execute as (q: unknown) => Promise<unknown>).call(fake, query);
      }
      return [];
    },
  });
  return wrapped as unknown as Queryable;
}
