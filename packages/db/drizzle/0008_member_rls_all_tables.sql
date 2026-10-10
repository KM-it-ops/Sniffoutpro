-- Every API request runs as sniffout_member with sniffout.user_id set to the signed-in person (see withMemberRole
-- in packages/db/src/client.ts). Row security below lets that person reach only their own rows and the rows of
-- organizations where they hold an active membership. Someone in several organizations sees all of them; the
-- database works out which from memberships, so the API never chooses one.
-- The table owner (migrations, sign-in bookkeeping, background jobs) is not the request role and keeps full access.
-- FORCE ROW LEVEL SECURITY is not set on purpose: the SECURITY DEFINER helpers read memberships and scopes as the owner.
DO $$ BEGIN
  CREATE ROLE sniffout_member NOLOGIN;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
-- The login role must be a member to switch into the restricted role.
GRANT sniffout_member TO CURRENT_USER;--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO sniffout_member;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  "organizations", "memberships", "authorization_scopes", "networks", "scan_runs", "hosts", "services",
  "findings", "client_profiles", "report_templates", "scan_diffs", "ssl_certificates", "scan_jobs"
  TO sniffout_member;--> statement-breakpoint
GRANT SELECT ON TABLE "users" TO sniffout_member;--> statement-breakpoint
GRANT SELECT, INSERT ON TABLE "cve_cache" TO sniffout_member;--> statement-breakpoint

CREATE OR REPLACE FUNCTION sniffout_user_id() RETURNS uuid
  LANGUAGE sql STABLE
  AS $$ SELECT NULLIF(current_setting('sniffout.user_id', true), '')::uuid $$;--> statement-breakpoint
CREATE OR REPLACE FUNCTION sniffout_org_ids() RETURNS SETOF uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
  AS $$ SELECT org_id FROM memberships WHERE user_id = sniffout_user_id() AND status = 'active' $$;--> statement-breakpoint
CREATE OR REPLACE FUNCTION sniffout_admin_org_ids() RETURNS SETOF uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
  AS $$ SELECT org_id FROM memberships
        WHERE user_id = sniffout_user_id() AND status = 'active' AND role = 'admin' $$;--> statement-breakpoint
CREATE OR REPLACE FUNCTION sniffout_invited_org_ids() RETURNS SETOF uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
  AS $$ SELECT org_id FROM memberships WHERE user_id = sniffout_user_id() AND status = 'pending' $$;--> statement-breakpoint
CREATE OR REPLACE FUNCTION sniffout_owns_scope(scope uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
  AS $$ SELECT EXISTS (SELECT 1 FROM authorization_scopes
                        WHERE id = scope AND user_id = sniffout_user_id()) $$;--> statement-breakpoint
CREATE OR REPLACE FUNCTION sniffout_org_has_members(org uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
  AS $$ SELECT EXISTS (SELECT 1 FROM memberships WHERE org_id = org) $$;--> statement-breakpoint
-- An admin inviting by email may learn that one account's id, and only for an organization they run.
CREATE OR REPLACE FUNCTION sniffout_invitee_id(org uuid, invitee_email text) RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
  AS $$ SELECT u.id FROM users u
        WHERE u.email = invitee_email AND org IN (SELECT sniffout_admin_org_ids()) $$;--> statement-breakpoint
REVOKE ALL ON FUNCTION sniffout_org_ids(), sniffout_admin_org_ids(), sniffout_invited_org_ids(),
  sniffout_owns_scope(uuid), sniffout_org_has_members(uuid), sniffout_invitee_id(uuid, text) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION sniffout_user_id(), sniffout_org_ids(), sniffout_admin_org_ids(), sniffout_invited_org_ids(),
  sniffout_owns_scope(uuid), sniffout_org_has_members(uuid), sniffout_invitee_id(uuid, text) TO sniffout_member;--> statement-breakpoint

ALTER TABLE "organizations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "memberships" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "authorization_scopes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "networks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "scan_runs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "hosts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "services" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "findings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "client_profiles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "report_templates" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "scan_diffs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "ssl_certificates" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "scan_jobs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

-- Replaced by scan_runs_member below (0004's policy read sniffout.org_id, which nothing sets).
DROP POLICY IF EXISTS "scan_runs_org_isolation" ON "scan_runs";--> statement-breakpoint

DROP POLICY IF EXISTS "organizations_member_read" ON "organizations";--> statement-breakpoint
CREATE POLICY "organizations_member_read" ON "organizations" FOR SELECT TO sniffout_member
  USING (id IN (SELECT sniffout_org_ids()) OR id IN (SELECT sniffout_invited_org_ids()));--> statement-breakpoint
DROP POLICY IF EXISTS "organizations_member_create" ON "organizations";--> statement-breakpoint
CREATE POLICY "organizations_member_create" ON "organizations" FOR INSERT TO sniffout_member
  WITH CHECK (sniffout_user_id() IS NOT NULL);--> statement-breakpoint
DROP POLICY IF EXISTS "organizations_admin_update" ON "organizations";--> statement-breakpoint
CREATE POLICY "organizations_admin_update" ON "organizations" FOR UPDATE TO sniffout_member
  USING (id IN (SELECT sniffout_admin_org_ids())) WITH CHECK (id IN (SELECT sniffout_admin_org_ids()));--> statement-breakpoint

DROP POLICY IF EXISTS "users_self_read" ON "users";--> statement-breakpoint
CREATE POLICY "users_self_read" ON "users" FOR SELECT TO sniffout_member
  USING (id = sniffout_user_id());--> statement-breakpoint

DROP POLICY IF EXISTS "memberships_member_read" ON "memberships";--> statement-breakpoint
CREATE POLICY "memberships_member_read" ON "memberships" FOR SELECT TO sniffout_member
  USING (user_id = sniffout_user_id() OR org_id IN (SELECT sniffout_org_ids()));--> statement-breakpoint
-- An admin adds people (as pending invites); the creator of a brand-new organization adds themselves as its admin.
DROP POLICY IF EXISTS "memberships_member_insert" ON "memberships";--> statement-breakpoint
CREATE POLICY "memberships_member_insert" ON "memberships" FOR INSERT TO sniffout_member
  WITH CHECK (
    org_id IN (SELECT sniffout_admin_org_ids())
    OR (user_id = sniffout_user_id() AND role = 'admin' AND status = 'active'
        AND NOT sniffout_org_has_members(org_id))
  );--> statement-breakpoint
-- An admin changes roles in their organization; an invited person may only turn their own pending invite active.
DROP POLICY IF EXISTS "memberships_member_update" ON "memberships";--> statement-breakpoint
CREATE POLICY "memberships_member_update" ON "memberships" FOR UPDATE TO sniffout_member
  USING (org_id IN (SELECT sniffout_admin_org_ids()) OR (user_id = sniffout_user_id() AND status = 'pending'))
  WITH CHECK (org_id IN (SELECT sniffout_admin_org_ids()) OR (user_id = sniffout_user_id() AND status = 'active'));--> statement-breakpoint
DROP POLICY IF EXISTS "memberships_admin_delete" ON "memberships";--> statement-breakpoint
CREATE POLICY "memberships_admin_delete" ON "memberships" FOR DELETE TO sniffout_member
  USING (org_id IN (SELECT sniffout_admin_org_ids()));--> statement-breakpoint

-- A scope is readable by the person who consented, and by members of an organization holding a scan made under it.
DROP POLICY IF EXISTS "authorization_scopes_member_read" ON "authorization_scopes";--> statement-breakpoint
CREATE POLICY "authorization_scopes_member_read" ON "authorization_scopes" FOR SELECT TO sniffout_member
  USING (
    user_id = sniffout_user_id()
    OR id IN (SELECT s.authorization_scope_id FROM scan_runs s WHERE s.org_id IN (SELECT sniffout_org_ids()))
  );--> statement-breakpoint
DROP POLICY IF EXISTS "authorization_scopes_self_insert" ON "authorization_scopes";--> statement-breakpoint
CREATE POLICY "authorization_scopes_self_insert" ON "authorization_scopes" FOR INSERT TO sniffout_member
  WITH CHECK (user_id = sniffout_user_id());--> statement-breakpoint

DROP POLICY IF EXISTS "scan_runs_member" ON "scan_runs";--> statement-breakpoint
CREATE POLICY "scan_runs_member" ON "scan_runs" FOR ALL TO sniffout_member
  USING (
    org_id IN (SELECT sniffout_org_ids())
    OR (org_id IS NULL AND sniffout_owns_scope(authorization_scope_id))
  )
  WITH CHECK (
    org_id IN (SELECT sniffout_org_ids())
    OR (org_id IS NULL AND sniffout_owns_scope(authorization_scope_id))
  );--> statement-breakpoint

-- Child rows follow their scan; a written row must carry its scan's organization.
DROP POLICY IF EXISTS "hosts_member" ON "hosts";--> statement-breakpoint
CREATE POLICY "hosts_member" ON "hosts" FOR ALL TO sniffout_member
  USING (EXISTS (SELECT 1 FROM scan_runs s WHERE s.id = hosts.scan_run_id))
  WITH CHECK (EXISTS (SELECT 1 FROM scan_runs s
                      WHERE s.id = hosts.scan_run_id AND s.org_id IS NOT DISTINCT FROM hosts.org_id));--> statement-breakpoint
DROP POLICY IF EXISTS "services_member" ON "services";--> statement-breakpoint
CREATE POLICY "services_member" ON "services" FOR ALL TO sniffout_member
  USING (EXISTS (SELECT 1 FROM hosts h WHERE h.id = services.host_id))
  WITH CHECK (EXISTS (SELECT 1 FROM hosts h
                      WHERE h.id = services.host_id AND h.org_id IS NOT DISTINCT FROM services.org_id));--> statement-breakpoint
DROP POLICY IF EXISTS "findings_member" ON "findings";--> statement-breakpoint
CREATE POLICY "findings_member" ON "findings" FOR ALL TO sniffout_member
  USING (EXISTS (SELECT 1 FROM scan_runs s WHERE s.id = findings.scan_run_id))
  WITH CHECK (EXISTS (SELECT 1 FROM scan_runs s
                      WHERE s.id = findings.scan_run_id AND s.org_id IS NOT DISTINCT FROM findings.org_id));--> statement-breakpoint
DROP POLICY IF EXISTS "ssl_certificates_member" ON "ssl_certificates";--> statement-breakpoint
CREATE POLICY "ssl_certificates_member" ON "ssl_certificates" FOR ALL TO sniffout_member
  USING (EXISTS (SELECT 1 FROM hosts h WHERE h.id = ssl_certificates.host_id))
  WITH CHECK (EXISTS (SELECT 1 FROM hosts h WHERE h.id = ssl_certificates.host_id));--> statement-breakpoint
DROP POLICY IF EXISTS "scan_diffs_member" ON "scan_diffs";--> statement-breakpoint
CREATE POLICY "scan_diffs_member" ON "scan_diffs" FOR ALL TO sniffout_member
  USING (EXISTS (SELECT 1 FROM scan_runs s WHERE s.id = scan_diffs.base_scan_run_id)
         AND EXISTS (SELECT 1 FROM scan_runs s WHERE s.id = scan_diffs.compare_scan_run_id))
  WITH CHECK (EXISTS (SELECT 1 FROM scan_runs s WHERE s.id = scan_diffs.base_scan_run_id)
              AND EXISTS (SELECT 1 FROM scan_runs s WHERE s.id = scan_diffs.compare_scan_run_id));--> statement-breakpoint

DROP POLICY IF EXISTS "networks_member" ON "networks";--> statement-breakpoint
CREATE POLICY "networks_member" ON "networks" FOR ALL TO sniffout_member
  USING (org_id IN (SELECT sniffout_org_ids())) WITH CHECK (org_id IN (SELECT sniffout_org_ids()));--> statement-breakpoint
DROP POLICY IF EXISTS "client_profiles_member" ON "client_profiles";--> statement-breakpoint
CREATE POLICY "client_profiles_member" ON "client_profiles" FOR ALL TO sniffout_member
  USING (org_id IN (SELECT sniffout_org_ids())) WITH CHECK (org_id IN (SELECT sniffout_org_ids()));--> statement-breakpoint
DROP POLICY IF EXISTS "report_templates_member" ON "report_templates";--> statement-breakpoint
CREATE POLICY "report_templates_member" ON "report_templates" FOR ALL TO sniffout_member
  USING (org_id IN (SELECT sniffout_org_ids())) WITH CHECK (org_id IN (SELECT sniffout_org_ids()));--> statement-breakpoint

-- A schedule belongs to the person who saved it, inside one of their organizations or personally.
DROP POLICY IF EXISTS "scan_jobs_owner" ON "scan_jobs";--> statement-breakpoint
CREATE POLICY "scan_jobs_owner" ON "scan_jobs" FOR ALL TO sniffout_member
  USING (user_id = sniffout_user_id() AND (org_id IS NULL OR org_id IN (SELECT sniffout_org_ids())))
  WITH CHECK (user_id = sniffout_user_id() AND (org_id IS NULL OR org_id IN (SELECT sniffout_org_ids())));
