import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

export const sqliteAuthorizationScopes = sqliteTable('authorization_scopes', {
  id: text('id').primaryKey(),
  targets: text('targets', { mode: 'json' }).$type<string[]>().notNull(),
  consentText: text('consent_text').notNull(),
  consentedAt: text('consented_at').notNull(),
  createdAt: text('created_at').notNull(),
});

export const sqliteScanRuns = sqliteTable('scan_runs', {
  id: text('id').primaryKey(),
  authorizationScopeId: text('authorization_scope_id').notNull(),
  status: text('status', {
    enum: ['pending', 'running', 'completed', 'failed', 'cancelled'],
  }).notNull(),
  targets: text('targets', { mode: 'json' }).$type<string[]>().notNull(),
  intensity: text('intensity', { enum: ['light', 'standard', 'deep'] }).notNull(),
  startedAt: text('started_at').notNull(),
  completedAt: text('completed_at'),
  rawOutput: text('raw_output'),
  normalizedOutput: text('normalized_output', { mode: 'json' }),
});

export const sqliteHosts = sqliteTable('hosts', {
  id: text('id').primaryKey(),
  scanRunId: text('scan_run_id').notNull(),
  ip: text('ip').notNull(),
  hostname: text('hostname'),
  mac: text('mac'),
  os: text('os'),
  osConfidence: real('os_confidence'),
});

export const sqliteServices = sqliteTable('services', {
  id: text('id').primaryKey(),
  hostId: text('host_id').notNull(),
  port: integer('port').notNull(),
  protocol: text('protocol', { enum: ['tcp', 'udp'] }).notNull(),
  product: text('product'),
  version: text('version'),
  banner: text('banner'),
});

export const sqliteFindings = sqliteTable('findings', {
  id: text('id').primaryKey(),
  scanRunId: text('scan_run_id').notNull(),
  hostId: text('host_id'),
  serviceId: text('service_id'),
  cveId: text('cve_id'),
  title: text('title').notNull(),
  severity: text('severity', {
    enum: ['critical', 'high', 'medium', 'low', 'info'],
  }).notNull(),
  cvssScore: real('cvss_score'),
  riskScore: real('risk_score').notNull(),
  description: text('description'),
});
