/**
 * The desktop app never opens a direct Postgres connection — cloud access goes
 * through tRPC and local storage is sql.js. `@sniffoutpro/db`'s root export
 * statically pulls in the Node-only `postgres` client, which cannot be bundled
 * for the browser (rollup fails on its `perf_hooks`/`crypto` imports). This
 * stub satisfies the import graph and fails loudly if ever actually invoked.
 */
export default function postgresUnavailable(): never {
  throw new Error('Direct Postgres access is not available in the desktop app');
}
