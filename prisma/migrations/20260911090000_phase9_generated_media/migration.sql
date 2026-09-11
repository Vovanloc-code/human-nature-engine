-- Phase 9: first-class generated media + VisualAsset provenance columns

ALTER TABLE "visual_assets" ADD COLUMN IF NOT EXISTS "storage_path" TEXT;
ALTER TABLE "visual_assets" ADD COLUMN IF NOT EXISTS "mime_type" TEXT;
ALTER TABLE "visual_assets" ADD COLUMN IF NOT EXISTS "width" INTEGER;
ALTER TABLE "visual_assets" ADD COLUMN IF NOT EXISTS "height" INTEGER;
ALTER TABLE "visual_assets" ADD COLUMN IF NOT EXISTS "provider" TEXT;
ALTER TABLE "visual_assets" ADD COLUMN IF NOT EXISTS "model" TEXT;
ALTER TABLE "visual_assets" ADD COLUMN IF NOT EXISTS "generation_id" TEXT;

DO $$ BEGIN
  CREATE TYPE "MediaQcStatus" AS ENUM ('pending', 'pass', 'regenerate', 'reject');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "generated_media" (
    "id" TEXT NOT NULL,
    "content_asset_id" TEXT,
    "visual_concept_id" TEXT,
    "storage_path" TEXT NOT NULL,
    "url" TEXT,
    "mime_type" TEXT NOT NULL DEFAULT 'image/png',
    "width" INTEGER,
    "height" INTEGER,
    "provider" TEXT NOT NULL,
    "model" TEXT,
    "generation_id" TEXT,
    "prompt" TEXT NOT NULL,
    "prompt_version" TEXT,
    "negative_constraints" JSONB,
    "qc_status" "MediaQcStatus" NOT NULL DEFAULT 'pending',
    "qc_notes" TEXT,
    "qc_details" JSONB,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "publication_record_id" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "generated_media_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "generated_media_content_asset_id_idx" ON "generated_media"("content_asset_id");
CREATE INDEX IF NOT EXISTS "generated_media_visual_concept_id_idx" ON "generated_media"("visual_concept_id");
CREATE INDEX IF NOT EXISTS "generated_media_qc_status_idx" ON "generated_media"("qc_status");

DO $$ BEGIN
  ALTER TABLE "generated_media" ADD CONSTRAINT "generated_media_content_asset_id_fkey"
    FOREIGN KEY ("content_asset_id") REFERENCES "content_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "generated_media" ADD CONSTRAINT "generated_media_visual_concept_id_fkey"
    FOREIGN KEY ("visual_concept_id") REFERENCES "visual_concepts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
