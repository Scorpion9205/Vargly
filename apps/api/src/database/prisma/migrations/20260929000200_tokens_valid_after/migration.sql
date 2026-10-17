-- A password change or reset ends the user's earlier sessions: access tokens issued before this
-- moment are refused, instead of staying valid until they expire.
-- AlterTable
ALTER TABLE "users" ADD COLUMN     "tokens_valid_after" TIMESTAMPTZ;
