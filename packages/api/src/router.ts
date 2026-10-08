import { healthRouter } from './routers/health.js';
import { scansRouter } from './routers/scans.js';
import { hostsRouter } from './routers/hosts.js';
import { findingsRouter } from './routers/findings.js';
import { authRouter } from './routers/auth.js';
import { scanJobsRouter } from './routers/scan-jobs.js';
import { reportsRouter } from './routers/reports.js';
import { organizationsRouter } from './routers/organizations.js';
import { router } from './trpc.js';

export const appRouter = router({
  health: healthRouter,
  scans: scansRouter,
  hosts: hostsRouter,
  findings: findingsRouter,
  auth: authRouter,
  scanJobs: scanJobsRouter,
  reports: reportsRouter,
  organizations: organizationsRouter,
});

export type AppRouter = typeof appRouter;
