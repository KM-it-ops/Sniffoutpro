import {
  pgTable,
  text,
  timestamp,
  uuid,
  integer,
  boolean,
  jsonb,
  real,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

export const organizations = pgTable('organizations', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  displayName: text('display_name'),
  tier: text('tier', { enum: ['PERSONAL', 'WORKSTATION', 'CONSULTANT', 'ADMIN'] })
    .notNull()
    .default('WORKSTATION'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const memberships = pgTable(
  'memberships',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    role: text('role', { enum: ['admin', 'analyst', 'viewer'] }).notNull(),
    // An invite is 'pending' until the invited person accepts it; only 'active' rows grant anything.
    status: text('status', { enum: ['pending', 'active'] })
      .notNull()
      .default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('memberships_org_id_idx').on(table.orgId),
    index('memberships_user_id_idx').on(table.userId),
    uniqueIndex('memberships_org_user_unique').on(table.orgId, table.userId),
  ],
);

export const authorizationScopes = pgTable(
  'authorization_scopes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').references(() => users.id),
    targets: jsonb('targets').$type<string[]>().notNull(),
    consentText: text('consent_text').notNull(),
    consentedAt: timestamp('consented_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('authorization_scopes_user_id_idx').on(table.userId)],
);

export const networks = pgTable(
  'networks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').references(() => organizations.id),
    name: text('name').notNull(),
    cidr: text('cidr'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('networks_org_id_idx').on(table.orgId)],
);

export const scanRuns = pgTable(
  'scan_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').references(() => organizations.id),
    authorizationScopeId: uuid('authorization_scope_id')
      .notNull()
      .references(() => authorizationScopes.id),
    status: text('status', {
      enum: ['pending', 'running', 'completed', 'failed', 'cancelled'],
    }).notNull(),
    targets: jsonb('targets').$type<string[]>().notNull(),
    intensity: text('intensity', { enum: ['light', 'standard', 'deep'] }).notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    rawOutput: text('raw_output'),
    normalizedOutput: jsonb('normalized_output'),
  },
  (table) => [
    index('scan_runs_started_at_idx').on(table.startedAt.desc()),
    index('scan_runs_org_id_idx').on(table.orgId),
  ],
);

export const hosts = pgTable(
  'hosts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    scanRunId: uuid('scan_run_id')
      .notNull()
      .references(() => scanRuns.id),
    /** Denormalized for Phase-6 ADMIN RLS; nullable until orgs are wired. */
    orgId: uuid('org_id').references(() => organizations.id),
    ip: text('ip').notNull(),
    hostname: text('hostname'),
    mac: text('mac'),
    os: text('os'),
    osConfidence: real('os_confidence'),
  },
  (table) => [
    index('hosts_scan_run_id_idx').on(table.scanRunId),
    index('hosts_org_id_idx').on(table.orgId),
  ],
);

export const services = pgTable(
  'services',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    hostId: uuid('host_id')
      .notNull()
      .references(() => hosts.id),
    /** Denormalized for Phase-6 ADMIN RLS; nullable until orgs are wired. */
    orgId: uuid('org_id').references(() => organizations.id),
    port: integer('port').notNull(),
    protocol: text('protocol', { enum: ['tcp', 'udp'] }).notNull(),
    product: text('product'),
    version: text('version'),
    banner: text('banner'),
  },
  (table) => [
    index('services_host_id_idx').on(table.hostId),
    index('services_org_id_idx').on(table.orgId),
  ],
);

export const cveCache = pgTable('cve_cache', {
  id: text('id').primaryKey(),
  description: text('description'),
  cvssScore: real('cvss_score'),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }).defaultNow().notNull(),
  raw: jsonb('raw'),
});

export const findings = pgTable(
  'findings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    scanRunId: uuid('scan_run_id')
      .notNull()
      .references(() => scanRuns.id),
    hostId: uuid('host_id').references(() => hosts.id),
    serviceId: uuid('service_id').references(() => services.id),
    /** Denormalized for Phase-6 ADMIN RLS; nullable until orgs are wired. */
    orgId: uuid('org_id').references(() => organizations.id),
    cveId: text('cve_id').references(() => cveCache.id),
    title: text('title').notNull(),
    severity: text('severity', {
      enum: ['critical', 'high', 'medium', 'low', 'info'],
    }).notNull(),
    cvssScore: real('cvss_score'),
    riskScore: real('risk_score').notNull(),
    description: text('description'),
    /** Port on the affected service — round-trips for scans.diff keys. */
    port: integer('port'),
  },
  (table) => [
    index('findings_scan_run_id_idx').on(table.scanRunId),
    index('findings_host_id_idx').on(table.hostId),
    index('findings_service_id_idx').on(table.serviceId),
    index('findings_org_id_idx').on(table.orgId),
  ],
);

export const clientProfiles = pgTable('client_profiles', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id),
  name: text('name').notNull(),
  logoUrl: text('logo_url'),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const reportTemplates = pgTable('report_templates', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id),
  name: text('name').notNull(),
  branding: jsonb('branding'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const scanDiffs = pgTable('scan_diffs', {
  id: uuid('id').primaryKey().defaultRandom(),
  baseScanRunId: uuid('base_scan_run_id')
    .notNull()
    .references(() => scanRuns.id),
  compareScanRunId: uuid('compare_scan_run_id')
    .notNull()
    .references(() => scanRuns.id),
  newCount: integer('new_count').notNull(),
  resolvedCount: integer('resolved_count').notNull(),
  changedCount: integer('changed_count').notNull(),
  diffPayload: jsonb('diff_payload'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const sslCertificates = pgTable('ssl_certificates', {
  id: uuid('id').primaryKey().defaultRandom(),
  hostId: uuid('host_id')
    .notNull()
    .references(() => hosts.id),
  port: integer('port').notNull(),
  subject: text('subject'),
  issuer: text('issuer'),
  validFrom: timestamp('valid_from', { withTimezone: true }),
  validTo: timestamp('valid_to', { withTimezone: true }),
  weakCipher: boolean('weak_cipher').default(false),
  chainIssues: jsonb('chain_issues').$type<string[]>(),
});

export const scanJobs = pgTable('scan_jobs', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').references(() => organizations.id),
  userId: uuid('user_id').references(() => users.id),
  cron: text('cron').notNull(),
  targets: jsonb('targets').$type<string[]>().notNull(),
  intensity: text('intensity', { enum: ['light', 'standard', 'deep'] }).notNull(),
  enabled: boolean('enabled').default(true).notNull(),
  nextRunAt: timestamp('next_run_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
