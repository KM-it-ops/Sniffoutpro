-- An invite is a pending offer until the invited person accepts it. Existing rows stay active.
ALTER TABLE "memberships" ADD COLUMN IF NOT EXISTS "status" text DEFAULT 'active' NOT NULL;
