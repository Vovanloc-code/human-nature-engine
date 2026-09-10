-- Phase 7: preference weights for feedback learning (overlay, not Page DNA rewrite)
CREATE TABLE IF NOT EXISTS "preference_weights" (
    "id" TEXT NOT NULL,
    "page_id" TEXT NOT NULL,
    "dimension" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "evidence_count" INTEGER NOT NULL DEFAULT 0,
    "approve_count" INTEGER NOT NULL DEFAULT 0,
    "reject_count" INTEGER NOT NULL DEFAULT 0,
    "favorite_count" INTEGER NOT NULL DEFAULT 0,
    "edit_count" INTEGER NOT NULL DEFAULT 0,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "preference_weights_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "preference_weights_page_id_dimension_key_key"
  ON "preference_weights"("page_id", "dimension", "key");

CREATE INDEX IF NOT EXISTS "preference_weights_page_id_idx"
  ON "preference_weights"("page_id");

CREATE INDEX IF NOT EXISTS "preference_weights_dimension_key_idx"
  ON "preference_weights"("dimension", "key");

ALTER TABLE "preference_weights"
  ADD CONSTRAINT "preference_weights_page_id_fkey"
  FOREIGN KEY ("page_id") REFERENCES "pages"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
