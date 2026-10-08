export const LOCAL_DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

export function shouldProvisionLocalDatabase(env: NodeJS.ProcessEnv): boolean {
  if (env['NODE_ENV'] === 'test' || env['VITEST'] === 'true') {
    return false;
  }
  if (env['VERCEL'] === '1' || (env['VERCEL_ENV'] !== undefined && env['VERCEL_ENV'] !== '')) {
    return false;
  }
  if (env['NODE_ENV'] === 'production') {
    return false;
  }
  const configured = env['DATABASE_URL']?.trim();
  return configured === undefined || configured === '' || configured === LOCAL_DATABASE_URL;
}
