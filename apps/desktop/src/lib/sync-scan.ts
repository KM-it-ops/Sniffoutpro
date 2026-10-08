import { createTRPCClient, httpBatchLink } from '@trpc/client';
import superjson from 'superjson';
import type { AppRouter } from '@sniffoutpro/api';
import type { ScanRun } from '@sniffoutpro/types';

function getWebUrl(): string {
  const url: unknown = import.meta.env['VITE_WEB_URL'];
  return typeof url === 'string' ? url : 'http://localhost:3000';
}

function createApiClient(accessToken: string) {
  return createTRPCClient<AppRouter>({
    links: [
      httpBatchLink({
        url: `${getWebUrl()}/api/trpc`,
        transformer: superjson,
        headers: () => ({ authorization: `Bearer ${accessToken}` }),
      }),
    ],
  });
}

export async function syncScanToCloud(
  scanRun: ScanRun,
  consentText: string,
  accessToken: string,
  rawOutput?: string,
): Promise<{ scanId: string }> {
  if (accessToken.length === 0) {
    throw new Error('Sign in before syncing this scan.');
  }
  const client = createApiClient(accessToken);
  const result = await client.scans.sync.mutate({
    consentText,
    scanRun,
    rawOutput,
  });
  return { scanId: result.scanId };
}
