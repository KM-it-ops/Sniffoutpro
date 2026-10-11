-- Open items N3, N5, N6 from the re-review of cf90d58-F1. All rules below bind only the request role sniffout_member;
-- the table owner (migrations, sign-in bookkeeping, background jobs) is unaffected.

-- N3: only the person who created an organization may make themselves its first admin.
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "created_by" uuid REFERENCES "users"("id");--> statement-breakpoint
CREATE OR REPLACE FUNCTION sniffout_org_created_by_me(org uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
  AS $$ SELECT EXISTS (SELECT 1 FROM organizations WHERE id = org AND created_by = sniffout_user_id()) $$;--> statement-breakpoint
-- Reads memberships as the owner: row security would hide other members once the caller's own row is gone.
-- Locks the organization row first, so two admins stepping down at once are checked one after the other; the
-- check after the wait sees the other's committed change.
CREATE OR REPLACE FUNCTION sniffout_org_has_active_admin(org uuid) RETURNS boolean
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM 1 FROM organizations WHERE id = org FOR UPDATE;
  RETURN EXISTS (SELECT 1 FROM memberships WHERE org_id = org AND role = 'admin' AND status = 'active');
END;
$$;--> statement-breakpoint
-- N6: who may write. In an organization, an active admin or analyst. Personally (no organization), anyone except a
-- person whose every active membership is viewer; scans.sync refuses those people the same way.
CREATE OR REPLACE FUNCTION sniffout_can_write(org uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
  AS $$ SELECT CASE
          WHEN org IS NULL THEN
            NOT EXISTS (SELECT 1 FROM memberships WHERE user_id = sniffout_user_id() AND status = 'active')
            OR EXISTS (SELECT 1 FROM memberships
                        WHERE user_id = sniffout_user_id() AND status = 'active' AND role IN ('admin', 'analyst'))
          ELSE EXISTS (SELECT 1 FROM memberships
                       WHERE user_id = sniffout_user_id() AND org_id = org AND status = 'active'
                         AND role IN ('admin', 'analyst'))
        END $$;--> statement-breakpoint
-- N5: email matching ignores letter case; an exact match wins if two accounts differ only in case.
CREATE OR REPLACE FUNCTION sniffout_invitee_id(org uuid, invitee_email text) RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
  AS $$ SELECT u.id FROM users u
        WHERE lower(u.email) = lower(invitee_email) AND org IN (SELECT sniffout_admin_org_ids())
        ORDER BY (u.email = invitee_email) DESC, u.id
        LIMIT 1 $$;--> statement-breakpoint
REVOKE ALL ON FUNCTION sniffout_org_created_by_me(uuid), sniffout_org_has_active_admin(uuid),
  sniffout_can_write(uuid) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION sniffout_org_created_by_me(uuid), sniffout_org_has_active_admin(uuid),
  sniffout_can_write(uuid) TO sniffout_member;--> statement-breakpoint

DROP POLICY IF EXISTS "organizations_member_create" ON "organizations";--> statement-breakpoint
CREATE POLICY "organizations_member_create" ON "organizations" FOR INSERT TO sniffout_member
  WITH CHECK (sniffout_user_id() IS NOT NULL AND created_by = sniffout_user_id());--> statement-breakpoint
DROP POLICY IF EXISTS "memberships_member_insert" ON "memberships";--> statement-breakpoint
CREATE POLICY "memberships_member_insert" ON "memberships" FOR INSERT TO sniffout_member
  WITH CHECK (
    (org_id IN (SELECT sniffout_admin_org_ids()) AND status = 'pending')
    OR (user_id = sniffout_user_id() AND role = 'admin' AND status = 'active'
        AND NOT sniffout_org_has_members(org_id) AND sniffout_org_created_by_me(org_id))
  );--> statement-breakpoint

-- N3: an organization must keep an active admin. Checked after the whole statement, so a bulk delete is caught too.
-- Not SECURITY DEFINER, so current_user is still the caller's role.
CREATE OR REPLACE FUNCTION sniffout_membership_keep_admin() RETURNS trigger
  LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF current_user <> 'sniffout_member' THEN
    RETURN NULL;
  END IF;
  IF OLD.role = 'admin' AND OLD.status = 'active' AND NOT sniffout_org_has_active_admin(OLD.org_id) THEN
    RAISE EXCEPTION 'An organization must keep at least one admin' USING ERRCODE = '42501';
  END IF;
  RETURN NULL;
END;
$$;--> statement-breakpoint
DROP TRIGGER IF EXISTS "memberships_keep_admin" ON "memberships";--> statement-breakpoint
CREATE TRIGGER "memberships_keep_admin" AFTER UPDATE OR DELETE ON "memberships"
  FOR EACH ROW EXECUTE FUNCTION sniffout_membership_keep_admin();--> statement-breakpoint

-- Same guard as 0009, now also refusing a change to the row's id or created_at (low item from the re-review).
CREATE OR REPLACE FUNCTION sniffout_membership_guard() RETURNS trigger
  LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF current_user <> 'sniffout_member' THEN
    RETURN NEW;
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'A membership id and creation time cannot change' USING ERRCODE = '42501';
  END IF;
  IF NEW.org_id IS DISTINCT FROM OLD.org_id OR NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'A membership cannot be moved to another person or organization' USING ERRCODE = '42501';
  END IF;
  IF NEW.role IS DISTINCT FROM OLD.role AND OLD.org_id NOT IN (SELECT sniffout_admin_org_ids()) THEN
    RAISE EXCEPTION 'Only an admin can change a role' USING ERRCODE = '42501';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status
     AND NOT (OLD.user_id = sniffout_user_id() AND OLD.status = 'pending' AND NEW.status = 'active') THEN
    RAISE EXCEPTION 'Only the invited person can accept an invite' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint

-- N6: each "FOR ALL" policy from 0008 becomes a read policy (unchanged) plus write policies that also need
-- sniffout_can_write, so a viewer can read their organization's rows but the database refuses their writes.
DROP POLICY IF EXISTS "scan_runs_member" ON "scan_runs";--> statement-breakpoint
CREATE POLICY "scan_runs_read" ON "scan_runs" FOR SELECT TO sniffout_member
  USING (org_id IN (SELECT sniffout_org_ids()) OR (org_id IS NULL AND sniffout_owns_scope(authorization_scope_id)));--> statement-breakpoint
CREATE POLICY "scan_runs_insert" ON "scan_runs" FOR INSERT TO sniffout_member
  WITH CHECK ((org_id IN (SELECT sniffout_org_ids()) OR (org_id IS NULL AND sniffout_owns_scope(authorization_scope_id)))
              AND sniffout_can_write(org_id));--> statement-breakpoint
CREATE POLICY "scan_runs_update" ON "scan_runs" FOR UPDATE TO sniffout_member
  USING ((org_id IN (SELECT sniffout_org_ids()) OR (org_id IS NULL AND sniffout_owns_scope(authorization_scope_id)))
         AND sniffout_can_write(org_id))
  WITH CHECK ((org_id IN (SELECT sniffout_org_ids()) OR (org_id IS NULL AND sniffout_owns_scope(authorization_scope_id)))
              AND sniffout_can_write(org_id));--> statement-breakpoint
CREATE POLICY "scan_runs_delete" ON "scan_runs" FOR DELETE TO sniffout_member
  USING ((org_id IN (SELECT sniffout_org_ids()) OR (org_id IS NULL AND sniffout_owns_scope(authorization_scope_id)))
         AND sniffout_can_write(org_id));--> statement-breakpoint

DROP POLICY IF EXISTS "hosts_member" ON "hosts";--> statement-breakpoint
CREATE POLICY "hosts_read" ON "hosts" FOR SELECT TO sniffout_member
  USING (EXISTS (SELECT 1 FROM scan_runs s WHERE s.id = hosts.scan_run_id));--> statement-breakpoint
CREATE POLICY "hosts_insert" ON "hosts" FOR INSERT TO sniffout_member
  WITH CHECK (EXISTS (SELECT 1 FROM scan_runs s WHERE s.id = hosts.scan_run_id
                        AND s.org_id IS NOT DISTINCT FROM hosts.org_id AND sniffout_can_write(s.org_id)));--> statement-breakpoint
CREATE POLICY "hosts_update" ON "hosts" FOR UPDATE TO sniffout_member
  USING (EXISTS (SELECT 1 FROM scan_runs s WHERE s.id = hosts.scan_run_id AND sniffout_can_write(s.org_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM scan_runs s WHERE s.id = hosts.scan_run_id
                        AND s.org_id IS NOT DISTINCT FROM hosts.org_id AND sniffout_can_write(s.org_id)));--> statement-breakpoint
CREATE POLICY "hosts_delete" ON "hosts" FOR DELETE TO sniffout_member
  USING (EXISTS (SELECT 1 FROM scan_runs s WHERE s.id = hosts.scan_run_id AND sniffout_can_write(s.org_id)));--> statement-breakpoint

DROP POLICY IF EXISTS "services_member" ON "services";--> statement-breakpoint
CREATE POLICY "services_read" ON "services" FOR SELECT TO sniffout_member
  USING (EXISTS (SELECT 1 FROM hosts h WHERE h.id = services.host_id));--> statement-breakpoint
CREATE POLICY "services_insert" ON "services" FOR INSERT TO sniffout_member
  WITH CHECK (EXISTS (SELECT 1 FROM hosts h WHERE h.id = services.host_id
                        AND h.org_id IS NOT DISTINCT FROM services.org_id AND sniffout_can_write(h.org_id)));--> statement-breakpoint
CREATE POLICY "services_update" ON "services" FOR UPDATE TO sniffout_member
  USING (EXISTS (SELECT 1 FROM hosts h WHERE h.id = services.host_id AND sniffout_can_write(h.org_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM hosts h WHERE h.id = services.host_id
                        AND h.org_id IS NOT DISTINCT FROM services.org_id AND sniffout_can_write(h.org_id)));--> statement-breakpoint
CREATE POLICY "services_delete" ON "services" FOR DELETE TO sniffout_member
  USING (EXISTS (SELECT 1 FROM hosts h WHERE h.id = services.host_id AND sniffout_can_write(h.org_id)));--> statement-breakpoint

DROP POLICY IF EXISTS "findings_member" ON "findings";--> statement-breakpoint
CREATE POLICY "findings_read" ON "findings" FOR SELECT TO sniffout_member
  USING (EXISTS (SELECT 1 FROM scan_runs s WHERE s.id = findings.scan_run_id));--> statement-breakpoint
CREATE POLICY "findings_insert" ON "findings" FOR INSERT TO sniffout_member
  WITH CHECK (EXISTS (SELECT 1 FROM scan_runs s WHERE s.id = findings.scan_run_id
                        AND s.org_id IS NOT DISTINCT FROM findings.org_id AND sniffout_can_write(s.org_id)));--> statement-breakpoint
CREATE POLICY "findings_update" ON "findings" FOR UPDATE TO sniffout_member
  USING (EXISTS (SELECT 1 FROM scan_runs s WHERE s.id = findings.scan_run_id AND sniffout_can_write(s.org_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM scan_runs s WHERE s.id = findings.scan_run_id
                        AND s.org_id IS NOT DISTINCT FROM findings.org_id AND sniffout_can_write(s.org_id)));--> statement-breakpoint
CREATE POLICY "findings_delete" ON "findings" FOR DELETE TO sniffout_member
  USING (EXISTS (SELECT 1 FROM scan_runs s WHERE s.id = findings.scan_run_id AND sniffout_can_write(s.org_id)));--> statement-breakpoint

DROP POLICY IF EXISTS "ssl_certificates_member" ON "ssl_certificates";--> statement-breakpoint
CREATE POLICY "ssl_certificates_read" ON "ssl_certificates" FOR SELECT TO sniffout_member
  USING (EXISTS (SELECT 1 FROM hosts h WHERE h.id = ssl_certificates.host_id));--> statement-breakpoint
CREATE POLICY "ssl_certificates_insert" ON "ssl_certificates" FOR INSERT TO sniffout_member
  WITH CHECK (EXISTS (SELECT 1 FROM hosts h WHERE h.id = ssl_certificates.host_id AND sniffout_can_write(h.org_id)));--> statement-breakpoint
CREATE POLICY "ssl_certificates_update" ON "ssl_certificates" FOR UPDATE TO sniffout_member
  USING (EXISTS (SELECT 1 FROM hosts h WHERE h.id = ssl_certificates.host_id AND sniffout_can_write(h.org_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM hosts h WHERE h.id = ssl_certificates.host_id AND sniffout_can_write(h.org_id)));--> statement-breakpoint
CREATE POLICY "ssl_certificates_delete" ON "ssl_certificates" FOR DELETE TO sniffout_member
  USING (EXISTS (SELECT 1 FROM hosts h WHERE h.id = ssl_certificates.host_id AND sniffout_can_write(h.org_id)));--> statement-breakpoint

DROP POLICY IF EXISTS "scan_diffs_member" ON "scan_diffs";--> statement-breakpoint
CREATE POLICY "scan_diffs_read" ON "scan_diffs" FOR SELECT TO sniffout_member
  USING (EXISTS (SELECT 1 FROM scan_runs s WHERE s.id = scan_diffs.base_scan_run_id)
         AND EXISTS (SELECT 1 FROM scan_runs s WHERE s.id = scan_diffs.compare_scan_run_id));--> statement-breakpoint
CREATE POLICY "scan_diffs_insert" ON "scan_diffs" FOR INSERT TO sniffout_member
  WITH CHECK (EXISTS (SELECT 1 FROM scan_runs s WHERE s.id = scan_diffs.base_scan_run_id AND sniffout_can_write(s.org_id))
              AND EXISTS (SELECT 1 FROM scan_runs s
                          WHERE s.id = scan_diffs.compare_scan_run_id AND sniffout_can_write(s.org_id)));--> statement-breakpoint
CREATE POLICY "scan_diffs_update" ON "scan_diffs" FOR UPDATE TO sniffout_member
  USING (EXISTS (SELECT 1 FROM scan_runs s WHERE s.id = scan_diffs.base_scan_run_id AND sniffout_can_write(s.org_id))
         AND EXISTS (SELECT 1 FROM scan_runs s
                     WHERE s.id = scan_diffs.compare_scan_run_id AND sniffout_can_write(s.org_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM scan_runs s WHERE s.id = scan_diffs.base_scan_run_id AND sniffout_can_write(s.org_id))
              AND EXISTS (SELECT 1 FROM scan_runs s
                          WHERE s.id = scan_diffs.compare_scan_run_id AND sniffout_can_write(s.org_id)));--> statement-breakpoint
CREATE POLICY "scan_diffs_delete" ON "scan_diffs" FOR DELETE TO sniffout_member
  USING (EXISTS (SELECT 1 FROM scan_runs s WHERE s.id = scan_diffs.base_scan_run_id AND sniffout_can_write(s.org_id))
         AND EXISTS (SELECT 1 FROM scan_runs s
                     WHERE s.id = scan_diffs.compare_scan_run_id AND sniffout_can_write(s.org_id)));--> statement-breakpoint

DROP POLICY IF EXISTS "networks_member" ON "networks";--> statement-breakpoint
CREATE POLICY "networks_read" ON "networks" FOR SELECT TO sniffout_member
  USING (org_id IN (SELECT sniffout_org_ids()));--> statement-breakpoint
CREATE POLICY "networks_insert" ON "networks" FOR INSERT TO sniffout_member
  WITH CHECK (org_id IN (SELECT sniffout_org_ids()) AND sniffout_can_write(org_id));--> statement-breakpoint
CREATE POLICY "networks_update" ON "networks" FOR UPDATE TO sniffout_member
  USING (org_id IN (SELECT sniffout_org_ids()) AND sniffout_can_write(org_id))
  WITH CHECK (org_id IN (SELECT sniffout_org_ids()) AND sniffout_can_write(org_id));--> statement-breakpoint
CREATE POLICY "networks_delete" ON "networks" FOR DELETE TO sniffout_member
  USING (org_id IN (SELECT sniffout_org_ids()) AND sniffout_can_write(org_id));--> statement-breakpoint

DROP POLICY IF EXISTS "client_profiles_member" ON "client_profiles";--> statement-breakpoint
CREATE POLICY "client_profiles_read" ON "client_profiles" FOR SELECT TO sniffout_member
  USING (org_id IN (SELECT sniffout_org_ids()));--> statement-breakpoint
CREATE POLICY "client_profiles_insert" ON "client_profiles" FOR INSERT TO sniffout_member
  WITH CHECK (org_id IN (SELECT sniffout_org_ids()) AND sniffout_can_write(org_id));--> statement-breakpoint
CREATE POLICY "client_profiles_update" ON "client_profiles" FOR UPDATE TO sniffout_member
  USING (org_id IN (SELECT sniffout_org_ids()) AND sniffout_can_write(org_id))
  WITH CHECK (org_id IN (SELECT sniffout_org_ids()) AND sniffout_can_write(org_id));--> statement-breakpoint
CREATE POLICY "client_profiles_delete" ON "client_profiles" FOR DELETE TO sniffout_member
  USING (org_id IN (SELECT sniffout_org_ids()) AND sniffout_can_write(org_id));--> statement-breakpoint

DROP POLICY IF EXISTS "report_templates_member" ON "report_templates";--> statement-breakpoint
CREATE POLICY "report_templates_read" ON "report_templates" FOR SELECT TO sniffout_member
  USING (org_id IN (SELECT sniffout_org_ids()));--> statement-breakpoint
CREATE POLICY "report_templates_insert" ON "report_templates" FOR INSERT TO sniffout_member
  WITH CHECK (org_id IN (SELECT sniffout_org_ids()) AND sniffout_can_write(org_id));--> statement-breakpoint
CREATE POLICY "report_templates_update" ON "report_templates" FOR UPDATE TO sniffout_member
  USING (org_id IN (SELECT sniffout_org_ids()) AND sniffout_can_write(org_id))
  WITH CHECK (org_id IN (SELECT sniffout_org_ids()) AND sniffout_can_write(org_id));--> statement-breakpoint
CREATE POLICY "report_templates_delete" ON "report_templates" FOR DELETE TO sniffout_member
  USING (org_id IN (SELECT sniffout_org_ids()) AND sniffout_can_write(org_id));--> statement-breakpoint

DROP POLICY IF EXISTS "scan_jobs_owner" ON "scan_jobs";--> statement-breakpoint
CREATE POLICY "scan_jobs_read" ON "scan_jobs" FOR SELECT TO sniffout_member
  USING (user_id = sniffout_user_id() AND (org_id IS NULL OR org_id IN (SELECT sniffout_org_ids())));--> statement-breakpoint
CREATE POLICY "scan_jobs_insert" ON "scan_jobs" FOR INSERT TO sniffout_member
  WITH CHECK (user_id = sniffout_user_id() AND (org_id IS NULL OR org_id IN (SELECT sniffout_org_ids()))
              AND sniffout_can_write(org_id));--> statement-breakpoint
CREATE POLICY "scan_jobs_update" ON "scan_jobs" FOR UPDATE TO sniffout_member
  USING (user_id = sniffout_user_id() AND (org_id IS NULL OR org_id IN (SELECT sniffout_org_ids()))
         AND sniffout_can_write(org_id))
  WITH CHECK (user_id = sniffout_user_id() AND (org_id IS NULL OR org_id IN (SELECT sniffout_org_ids()))
              AND sniffout_can_write(org_id));--> statement-breakpoint
CREATE POLICY "scan_jobs_delete" ON "scan_jobs" FOR DELETE TO sniffout_member
  USING (user_id = sniffout_user_id() AND (org_id IS NULL OR org_id IN (SELECT sniffout_org_ids()))
         AND sniffout_can_write(org_id));
