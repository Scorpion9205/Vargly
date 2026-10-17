-- Paper studio: question papers (AI-generated or uploaded) shared with a batch by link.
-- AlterEnum
ALTER TYPE "ai_provider_type" ADD VALUE 'GROQ';

-- CreateEnum
CREATE TYPE "paper_source" AS ENUM ('AI', 'UPLOAD');

-- CreateEnum
CREATE TYPE "paper_status" AS ENUM ('DRAFT', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "paper_share_kind" AS ENUM ('HOMEWORK', 'PRACTICE');

-- CreateTable
CREATE TABLE "papers" (
    "id" UUID NOT NULL,
    "coaching_id" UUID NOT NULL,
    "source" "paper_source" NOT NULL,
    "status" "paper_status" NOT NULL DEFAULT 'DRAFT',
    "title" VARCHAR(255) NOT NULL,
    "subject" VARCHAR(100) NOT NULL,
    "topic" TEXT,
    "language" VARCHAR(20) NOT NULL DEFAULT 'en',
    "questions" JSONB NOT NULL DEFAULT '[]',
    "file_url" TEXT,
    "file_key" VARCHAR(500),
    "file_name" VARCHAR(255),
    "created_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "papers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "paper_shares" (
    "id" UUID NOT NULL,
    "coaching_id" UUID NOT NULL,
    "paper_id" UUID NOT NULL,
    "batch_id" UUID NOT NULL,
    "kind" "paper_share_kind" NOT NULL,
    "token" VARCHAR(64) NOT NULL,
    "homework_id" UUID,
    "open_count" INTEGER NOT NULL DEFAULT 0,
    "last_opened_at" TIMESTAMPTZ,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "paper_shares_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "papers_coaching_id_created_by_updated_at_idx" ON "papers"("coaching_id", "created_by", "updated_at");

-- CreateIndex
CREATE UNIQUE INDEX "paper_shares_token_key" ON "paper_shares"("token");

-- CreateIndex
CREATE INDEX "paper_shares_coaching_id_paper_id_idx" ON "paper_shares"("coaching_id", "paper_id");

-- AddForeignKey
ALTER TABLE "paper_shares" ADD CONSTRAINT "paper_shares_paper_id_fkey" FOREIGN KEY ("paper_id") REFERENCES "papers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "paper_shares" ADD CONSTRAINT "paper_shares_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Tenant row-level security, as on every other tenant table (see the tenant RLS migration)
DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['papers', 'paper_shares']
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

-- A share may only point at a paper and a batch of its own coaching (see the same-tenant migration)
DO $$
DECLARE
  ref text[];
  refs text[][] := ARRAY[
    ARRAY['paper_shares', 'paper_id', 'papers'],
    ARRAY['paper_shares', 'batch_id', 'batches']
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
