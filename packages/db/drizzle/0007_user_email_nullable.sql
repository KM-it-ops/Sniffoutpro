-- When an email moves to a new account, the old row keeps its data but loses the email.
ALTER TABLE "users" ALTER COLUMN "email" DROP NOT NULL;
