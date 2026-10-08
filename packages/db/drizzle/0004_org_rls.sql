-- A restricted role, not the table owner, may read only the organization named in sniffout.org_id.
DO $$ BEGIN
  CREATE ROLE sniffout_member NOLOGIN;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
GRANT SELECT ON TABLE "scan_runs" TO sniffout_member;--> statement-breakpoint
ALTER TABLE "scan_runs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "scan_runs_org_isolation" ON "scan_runs";--> statement-breakpoint
CREATE POLICY "scan_runs_org_isolation" ON "scan_runs"
  FOR SELECT
  TO sniffout_member
  USING (
    org_id = NULLIF(current_setting('sniffout.org_id', true), '')::uuid
  );
