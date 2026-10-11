import type { Queryable } from '@sniffoutpro/db';

/**
 * Lets a hand-made fake database stand in for the real one now that every signed-in request
 * runs inside `withMemberRole`. That outer transaction hands the procedure the same fake; the
 * role switch and user setting (raw `execute` calls) are accepted and ignored unless the fake
 * defines its own `execute`. A transaction the procedure opens itself still reaches the fake's
 * own `transaction`, so a fake that records writes there keeps recording them.
 */
export function memberDb(fake: object): Queryable {
  const own = fake as { execute?: unknown; transaction?: unknown };
  const execute = async (query: unknown) => {
    if (typeof own.execute === 'function') {
      return (own.execute as (q: unknown) => Promise<unknown>).call(fake, query);
    }
    return [];
  };
  const inner: object = Object.assign(Object.create(fake) as object, {
    execute,
    transaction: async (work: (tx: unknown) => Promise<unknown>) =>
      typeof own.transaction === 'function'
        ? (own.transaction as (w: typeof work) => Promise<unknown>).call(fake, work)
        : work(inner),
  });
  const outer = Object.assign(Object.create(fake) as object, {
    execute,
    transaction: async (work: (tx: unknown) => Promise<unknown>) => work(inner),
  });
  return outer as unknown as Queryable;
}
