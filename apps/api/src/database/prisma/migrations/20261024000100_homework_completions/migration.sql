-- Student panel: a student marking a homework as done, so the teacher can see who has.
-- CreateTable
CREATE TABLE "homework_completions" (
    "id" UUID NOT NULL,
    "coaching_id" UUID NOT NULL,
    "homework_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "done_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "homework_completions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "homework_completions_homework_id_student_id_key" ON "homework_completions"("homework_id", "student_id");
CREATE INDEX "homework_completions_coaching_id_student_id_idx" ON "homework_completions"("coaching_id", "student_id");

-- AddForeignKey
ALTER TABLE "homework_completions" ADD CONSTRAINT "homework_completions_homework_id_fkey" FOREIGN KEY ("homework_id") REFERENCES "homework"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "homework_completions" ADD CONSTRAINT "homework_completions_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Tenant row-level security, as on every other tenant table (see the tenant RLS migration)
ALTER TABLE "homework_completions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "homework_completions" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON "homework_completions";
CREATE POLICY tenant_isolation_policy ON "homework_completions"
  FOR ALL
  USING (
    current_setting('app.rls_bypass', true) = 'on'
    OR coaching_id = NULLIF(current_setting('app.current_coaching_id', true), '')::uuid
  )
  WITH CHECK (
    current_setting('app.rls_bypass', true) = 'on'
    OR coaching_id = NULLIF(current_setting('app.current_coaching_id', true), '')::uuid
  );

-- A completion may only point at a homework and a student of its own coaching (see the same-tenant migration)
DO $$
DECLARE
  ref text[];
  refs text[][] := ARRAY[
    ARRAY['homework_completions', 'homework_id', 'homework'],
    ARRAY['homework_completions', 'student_id', 'students']
  ];
BEGIN
  FOREACH ref SLICE 1 IN ARRAY refs
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', 'same_tenant_' || ref[3], ref[1]);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE INSERT OR UPDATE OF %I, coaching_id ON %I
         FOR EACH ROW EXECUTE FUNCTION enforce_same_tenant_reference(%L, %L)',
      'same_tenant_' || ref[3], ref[2], ref[1], ref[2], ref[3]
    );
  END LOOP;
END $$;
