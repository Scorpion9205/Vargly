-- A payment that arrived but could not be applied (e.g. the amount differs from the order price)
-- is kept for a person to resolve, instead of existing only in the logs.
-- AlterEnum
ALTER TYPE "billing_payment_status" ADD VALUE 'NEEDS_REVIEW';

-- AlterTable
ALTER TABLE "billing_payments" ADD COLUMN     "review_note" TEXT,
ADD COLUMN     "reviewed_at" TIMESTAMPTZ,
ADD COLUMN     "reviewed_by" UUID;

-- CreateIndex
CREATE INDEX "billing_payments_status_idx" ON "billing_payments"("status");
