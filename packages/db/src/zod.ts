import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';
import {
  authorizationScopes,
  cveCache,
  findings,
  hosts,
  organizations,
  scanRuns,
  services,
  users,
} from './schema/index.js';

export const selectOrganizationSchema = createSelectSchema(organizations);
export const insertOrganizationSchema = createInsertSchema(organizations);

export const selectUserSchema = createSelectSchema(users);
export const insertUserSchema = createInsertSchema(users);

export const selectAuthorizationScopeSchema = createSelectSchema(authorizationScopes);
export const insertAuthorizationScopeSchema = createInsertSchema(authorizationScopes);

export const selectScanRunSchema = createSelectSchema(scanRuns);
export const insertScanRunSchema = createInsertSchema(scanRuns);

export const selectHostSchema = createSelectSchema(hosts);
export const insertHostSchema = createInsertSchema(hosts);

export const selectServiceSchema = createSelectSchema(services);
export const insertServiceSchema = createInsertSchema(services);

export const selectFindingSchema = createSelectSchema(findings);
export const insertFindingSchema = createInsertSchema(findings);

export const selectCveCacheSchema = createSelectSchema(cveCache);
export const insertCveCacheSchema = createInsertSchema(cveCache);

export type SelectScanRun = z.infer<typeof selectScanRunSchema>;
export type InsertScanRun = z.infer<typeof insertScanRunSchema>;
export type SelectFinding = z.infer<typeof selectFindingSchema>;
export type SelectHost = z.infer<typeof selectHostSchema>;
