-- Audit hardening: FK indexes, started_at ordering, org_id for RLS readiness, finding.port round-trip
--
-- NAME MAPPING (docs/AUDIT-RESIDUAL-2026-07-09.md): this Drizzle migration
-- (journal tag `0001_audit_hardening`, packages/db/drizzle/meta/_journal.json)
-- was applied to production via the Supabase MCP under the migration name
-- `audit_hardening` (see docs/PHASE-LOG.md). Same DDL content, two names.
--
-- Re-run behavior: because prod was applied via the Supabase MCP, prod's
-- `drizzle.__drizzle_migrations` has NO row for 0001 — a `drizzle-kit migrate`
-- against prod WILL re-execute this file. That is safe: every statement below
-- is idempotent (IF NOT EXISTS / duplicate_object-guarded). No further DDL
-- change is required.
ALTER TABLE "hosts" ADD COLUMN IF NOT EXISTS "org_id" uuid;--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN IF NOT EXISTS "org_id" uuid;--> statement-breakpoint
ALTER TABLE "findings" ADD COLUMN IF NOT EXISTS "org_id" uuid;--> statement-breakpoint
ALTER TABLE "findings" ADD COLUMN IF NOT EXISTS "port" integer;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "hosts" ADD CONSTRAINT "hosts_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "services" ADD CONSTRAINT "services_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "findings" ADD CONSTRAINT "findings_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hosts_scan_run_id_idx" ON "hosts" USING btree ("scan_run_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hosts_org_id_idx" ON "hosts" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "services_host_id_idx" ON "services" USING btree ("host_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "services_org_id_idx" ON "services" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "findings_scan_run_id_idx" ON "findings" USING btree ("scan_run_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "findings_host_id_idx" ON "findings" USING btree ("host_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "findings_service_id_idx" ON "findings" USING btree ("service_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "findings_org_id_idx" ON "findings" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "scan_runs_started_at_idx" ON "scan_runs" USING btree ("started_at" DESC);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "memberships_org_id_idx" ON "memberships" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "memberships_user_id_idx" ON "memberships" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "authorization_scopes_user_id_idx" ON "authorization_scopes" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "networks_org_id_idx" ON "networks" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "scan_runs_org_id_idx" ON "scan_runs" USING btree ("org_id");
