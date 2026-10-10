-- Row security cannot compare a row before and after an update, so this trigger does it (re-review of cf90d58-F1).
-- For the restricted role only: an update may never move a membership to another person or organization; only an
-- admin of that organization may change a role; and a status may only change when the invited person accepts
-- their own pending invite. New memberships added by an admin start pending, so consent stays with the invitee.
CREATE OR REPLACE FUNCTION sniffout_membership_guard() RETURNS trigger
  LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF current_user <> 'sniffout_member' THEN
    RETURN NEW;
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
DROP TRIGGER IF EXISTS "memberships_guard" ON "memberships";--> statement-breakpoint
CREATE TRIGGER "memberships_guard" BEFORE UPDATE ON "memberships"
  FOR EACH ROW EXECUTE FUNCTION sniffout_membership_guard();--> statement-breakpoint
DROP POLICY IF EXISTS "memberships_member_insert" ON "memberships";--> statement-breakpoint
CREATE POLICY "memberships_member_insert" ON "memberships" FOR INSERT TO sniffout_member
  WITH CHECK (
    (org_id IN (SELECT sniffout_admin_org_ids()) AND status = 'pending')
    OR (user_id = sniffout_user_id() AND role = 'admin' AND status = 'active'
        AND NOT sniffout_org_has_members(org_id))
  );
