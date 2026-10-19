-- A SUPER_ADMIN (Vargly's own operator) has no coaching: users.coaching_id is already nullable
-- for them, but their role link could not be stored because user_roles.coaching_id was NOT NULL.
-- The same-tenant trigger treats NULL = NULL as the same tenant, so it needs no change.
-- AlterTable
ALTER TABLE "user_roles" ALTER COLUMN "coaching_id" DROP NOT NULL;
