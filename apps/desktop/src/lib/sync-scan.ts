import { createTRPCClient, httpBatchLink } from '@trpc/client';
import superjson from 'superjson';
import type { AppRouter } from '@sniffoutpro/api';
import type { ScanRun } from '@sniffoutpro/types';

function getWebUrl(): string {
  const url: unknown = import.meta.env['VITE_WEB_URL'];
  return typeof url === 'string' ? url : 'http://localhost:3000';
}

function getSyncToken(): string | undefined {
  const token: unknown = import.meta.env['VITE_SYNC_TOKEN'];
  return typeof token === 'string' && token.length > 0 ? token : undefined;
}

function createApiClient() {
  const syncToken = getSyncToken();
  return createTRPCClient<AppRouter>({
    links: [
      httpBatchLink({
        url: `${getWebUrl()}/api/trpc`,
        transformer: superjson,
        headers: () => (syncToken !== undefined ? { authorization: `Bearer ${syncToken}` } : {}),
      }),
    ],
  });
}

export async function syncScanToCloud(
  scanRun: ScanRun,
  consentText: string,
  rawOutput?: string,
): Promise<{ scanId: string }> {
  const client = createApiClient();
  const result = await client.scans.sync.mutate({
    consentText,
    scanRun,
    rawOutput,
  });
  return { scanId: result.scanId };
}
