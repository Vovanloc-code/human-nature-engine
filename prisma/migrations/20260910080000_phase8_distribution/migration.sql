-- Phase 8: track when a content asset was published
ALTER TABLE "content_assets" ADD COLUMN IF NOT EXISTS "published_at" TIMESTAMP(3);
