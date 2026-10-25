-- Staff attendance: which teachers came on which day, and what it means for their pay.
-- CreateEnum
CREATE TYPE "staff_attendance_status" AS ENUM ('PRESENT', 'HALF_DAY', 'ABSENT', 'LEAVE');

-- CreateTable
CREATE TABLE "staff_attendance" (
    "id" UUID NOT NULL,
    "coaching_id" UUID NOT NULL,
    "teacher_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "status" "staff_attendance_status" NOT NULL,
    "note" VARCHAR(255),
    "marked_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "staff_attendance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "staff_attendance_teacher_id_date_key" ON "staff_attendance"("teacher_id", "date");

-- CreateIndex
CREATE INDEX "staff_attendance_coaching_id_date_idx" ON "staff_attendance"("coaching_id", "date");

-- Tenant row-level security, as on every other tenant table (see the tenant RLS migration)
ALTER TABLE "staff_attendance" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "staff_attendance" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON "staff_attendance";
CREATE POLICY tenant_isolation_policy ON "staff_attendance"
  FOR ALL
  USING (
    current_setting('app.rls_bypass', true) = 'on'
    OR coaching_id = NULLIF(current_setting('app.current_coaching_id', true), '')::uuid
  )
  WITH CHECK (
    current_setting('app.rls_bypass', true) = 'on'
    OR coaching_id = NULLIF(current_setting('app.current_coaching_id', true), '')::uuid
  );

-- A mark may only point at a teacher of its own coaching (see the same-tenant migration)
DROP TRIGGER IF EXISTS same_tenant_teachers ON staff_attendance;
CREATE TRIGGER same_tenant_teachers BEFORE INSERT OR UPDATE OF teacher_id, coaching_id ON staff_attendance
  FOR EACH ROW EXECUTE FUNCTION enforce_same_tenant_reference('teacher_id', 'teachers');
