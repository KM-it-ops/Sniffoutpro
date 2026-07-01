import { handleCveSyncDaily } from '@sniffoutpro/api';
import { serve } from 'inngest/next';
import { inngest } from '../../../inngest/client';

const cveSyncDaily = inngest.createFunction(
  { id: 'cve-sync-daily' },
  { cron: '0 3 * * *' },
  () => handleCveSyncDaily({ name: 'cve/sync.daily', data: {} }),
);

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [cveSyncDaily],
});
