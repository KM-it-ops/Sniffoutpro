-- Per-user tier. New rows default to WORKSTATION. A missing row is not a tier.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "tier" text DEFAULT 'WORKSTATION' NOT NULL;
