-- Parent feedback: a short rating survey sent to parents on WhatsApp as a link.
-- CreateTable
CREATE TABLE "surveys" (
    "id" UUID NOT NULL,
    "coaching_id" UUID NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "question" VARCHAR(500) NOT NULL,
    "batch_id" UUID,
    "sent_count" INTEGER NOT NULL DEFAULT 0,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMPTZ,

    CONSTRAINT "surveys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "survey_invites" (
    "id" UUID NOT NULL,
    "coaching_id" UUID NOT NULL,
    "survey_id" UUID NOT NULL,
    "parent_id" UUID NOT NULL,
    "token" VARCHAR(64) NOT NULL,
    "rating" SMALLINT,
    "comment" VARCHAR(1000),
    "responded_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "survey_invites_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "surveys_coaching_id_created_at_idx" ON "surveys"("coaching_id", "created_at");
CREATE UNIQUE INDEX "survey_invites_token_key" ON "survey_invites"("token");
CREATE UNIQUE INDEX "survey_invites_survey_id_parent_id_key" ON "survey_invites"("survey_id", "parent_id");
CREATE INDEX "survey_invites_coaching_id_survey_id_idx" ON "survey_invites"("coaching_id", "survey_id");

-- AddForeignKey
ALTER TABLE "survey_invites" ADD CONSTRAINT "survey_invites_survey_id_fkey" FOREIGN KEY ("survey_id") REFERENCES "surveys"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- A rating is 1 to 5
ALTER TABLE "survey_invites" ADD CONSTRAINT "survey_invites_rating_range" CHECK ("rating" IS NULL OR ("rating" BETWEEN 1 AND 5));

-- Tenant row-level security, as on every other tenant table (see the tenant RLS migration)
DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['surveys', 'survey_invites']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', tbl);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation_policy ON %I', tbl);
    EXECUTE format(
      $policy$
      CREATE POLICY tenant_isolation_policy ON %I
        FOR ALL
        USING (
          current_setting('app.rls_bypass', true) = 'on'
          OR coaching_id = NULLIF(current_setting('app.current_coaching_id', true), '')::uuid
        )
        WITH CHECK (
          current_setting('app.rls_bypass', true) = 'on'
          OR coaching_id = NULLIF(current_setting('app.current_coaching_id', true), '')::uuid
        )
      $policy$,
      tbl
    );
  END LOOP;
END $$;

-- An invite may only point at a survey and a parent of its own coaching (see the same-tenant migration)
DO $$
DECLARE
  ref text[];
  refs text[][] := ARRAY[
    ARRAY['survey_invites', 'survey_id', 'surveys'],
    ARRAY['survey_invites', 'parent_id', 'parents']
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
