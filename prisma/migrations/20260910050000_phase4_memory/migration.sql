-- Phase 4 Memory: embeddings + enhanced duplicate_checks

-- AlterTable duplicate_checks: allow insight-level checks; similarity breakdown
ALTER TABLE "duplicate_checks" ALTER COLUMN "content_asset_id" DROP NOT NULL;

ALTER TABLE "duplicate_checks" ADD COLUMN IF NOT EXISTS "insight_id" TEXT;
ALTER TABLE "duplicate_checks" ADD COLUMN IF NOT EXISTS "compared_insight_id" TEXT;
ALTER TABLE "duplicate_checks" ADD COLUMN IF NOT EXISTS "text_similarity" DOUBLE PRECISION;
ALTER TABLE "duplicate_checks" ADD COLUMN IF NOT EXISTS "insight_similarity" DOUBLE PRECISION;
ALTER TABLE "duplicate_checks" ADD COLUMN IF NOT EXISTS "genome_similarity" DOUBLE PRECISION;
ALTER TABLE "duplicate_checks" ADD COLUMN IF NOT EXISTS "visual_similarity" DOUBLE PRECISION;
ALTER TABLE "duplicate_checks" ADD COLUMN IF NOT EXISTS "details" JSONB;

CREATE INDEX IF NOT EXISTS "duplicate_checks_insight_id_idx" ON "duplicate_checks"("insight_id");
CREATE INDEX IF NOT EXISTS "duplicate_checks_content_asset_id_idx" ON "duplicate_checks"("content_asset_id");

-- CreateTable embeddings
CREATE TABLE IF NOT EXISTS "embeddings" (
    "id" TEXT NOT NULL,
    "object_type" TEXT NOT NULL,
    "object_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'default',
    "model" TEXT NOT NULL DEFAULT 'fixture',
    "dims" INTEGER NOT NULL,
    "values" JSONB NOT NULL,
    "embedding" vector(64),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "embeddings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "embeddings_object_type_object_id_kind_key" ON "embeddings"("object_type", "object_id", "kind");
CREATE INDEX IF NOT EXISTS "embeddings_object_type_object_id_idx" ON "embeddings"("object_type", "object_id");
