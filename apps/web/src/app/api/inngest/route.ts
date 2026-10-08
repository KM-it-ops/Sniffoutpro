import { cveCache } from '@sniffoutpro/db/schema';
import { fetchNvdWindow, nvdSyncWindow, runCveSync, type CveCacheRow } from '@sniffoutpro/api';
import { serve } from 'inngest/next';
import { getDb } from '@/lib/db';
import { inngest } from '../../../inngest/client';

const cveSyncDaily = inngest.createFunction(
  { id: 'cve-sync-daily' },
  { cron: '0 3 * * *' },
  async () => {
    const db = getDb();
    const existingRows = await db.select().from(cveCache);
    const existing: CveCacheRow[] = existingRows.map((row) => ({
      id: row.id,
      description: row.description,
      cvssScore: row.cvssScore,
      publishedAt: row.publishedAt === null ? null : row.publishedAt.toISOString(),
      lastSyncedAt: row.lastSyncedAt.toISOString(),
    }));
    const syncedAt = new Date().toISOString();
    const latest = existing.reduce<string | null>(
      (max, row) => (max === null || row.lastSyncedAt > max ? row.lastSyncedAt : max),
      null,
    );
    const window = nvdSyncWindow(latest, new Date(syncedAt));
    const result = await runCveSync({
      existing,
      syncedAt,
      fetchFeed: () =>
        fetchNvdWindow(window, async (url) => {
          const response = await fetch(url);
          if (!response.ok) {
            throw new Error(`NVD feed responded ${String(response.status)}`);
          }
          return response.json();
        }),
    });
    if (result.wrote) {
      for (const row of result.incoming) {
        await db
          .insert(cveCache)
          .values({
            id: row.id,
            description: row.description,
            cvssScore: row.cvssScore,
            publishedAt: row.publishedAt === null ? null : new Date(row.publishedAt),
            lastSyncedAt: new Date(row.lastSyncedAt),
          })
          .onConflictDoUpdate({
            target: cveCache.id,
            set: {
              description: row.description,
              cvssScore: row.cvssScore,
              publishedAt: row.publishedAt === null ? null : new Date(row.publishedAt),
              lastSyncedAt: new Date(row.lastSyncedAt),
            },
          });
      }
    }
    return {
      accepted: true as const,
      wrote: result.wrote,
      count: result.incoming.length,
      api: 'nvd-2.0' as const,
    };
  },
);

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [cveSyncDaily],
});
