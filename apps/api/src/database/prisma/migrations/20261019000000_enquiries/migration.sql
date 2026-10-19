-- Enquiries: people who ask about fees and timings and are called back later.
-- CreateEnum
CREATE TYPE "enquiry_source" AS ENUM ('WALK_IN', 'PHONE', 'WHATSAPP', 'REFERRAL', 'OTHER');

-- CreateEnum
CREATE TYPE "enquiry_status" AS ENUM ('NEW', 'CONTACTED', 'ADMITTED', 'NOT_INTERESTED');

-- CreateTable
CREATE TABLE "enquiries" (
    "id" UUID NOT NULL,
    "coaching_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "phone" VARCHAR(30) NOT NULL,
    "student_name" VARCHAR(255),
    "interested_in" VARCHAR(255),
    "source" "enquiry_source" NOT NULL DEFAULT 'WALK_IN',
    "status" "enquiry_status" NOT NULL DEFAULT 'NEW',
    "notes" TEXT,
    "follow_up_on" DATE,
    "last_contacted_at" TIMESTAMPTZ,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "enquiries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "enquiries_coaching_id_status_follow_up_on_idx" ON "enquiries"("coaching_id", "status", "follow_up_on");

-- CreateIndex
CREATE INDEX "enquiries_coaching_id_created_at_idx" ON "enquiries"("coaching_id", "created_at");

-- Tenant row-level security, as on every other tenant table (see the tenant RLS migration)
ALTER TABLE "enquiries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "enquiries" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON "enquiries";
CREATE POLICY tenant_isolation_policy ON "enquiries"
  FOR ALL
  USING (
    current_setting('app.rls_bypass', true) = 'on'
    OR coaching_id = NULLIF(current_setting('app.current_coaching_id', true), '')::uuid
  )
  WITH CHECK (
    current_setting('app.rls_bypass', true) = 'on'
    OR coaching_id = NULLIF(current_setting('app.current_coaching_id', true), '')::uuid
  );
