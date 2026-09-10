-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector";

-- CreateEnum
CREATE TYPE "InsightStatus" AS ENUM ('candidate', 'approved', 'rejected', 'used', 'retired', 'needs_research');

-- CreateEnum
CREATE TYPE "FeedbackAction" AS ENUM ('approve', 'reject', 'edit', 'favorite', 'regenerate', 'publish');

-- CreateEnum
CREATE TYPE "AgentRunStatus" AS ENUM ('pending', 'running', 'succeeded', 'failed', 'cancelled');

-- CreateTable
CREATE TABLE "pages" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "page_dna" (
    "id" TEXT NOT NULL,
    "page_id" TEXT NOT NULL,
    "topics" JSONB NOT NULL,
    "voice" JSONB NOT NULL,
    "visual_mix" JSONB NOT NULL,
    "format_mix" JSONB NOT NULL,
    "weights" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "page_dna_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "taxonomy_categories" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "taxonomy_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "taxonomy_nodes" (
    "id" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "taxonomy_nodes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "human_insights" (
    "id" TEXT NOT NULL,
    "statement" TEXT NOT NULL,
    "observation" TEXT,
    "desire" TEXT,
    "hidden_fear" TEXT,
    "contradictory_behavior" TEXT,
    "cost" TEXT,
    "primary_conflict_id" TEXT,
    "secondary_conflicts" JSONB,
    "universality_score" DOUBLE PRECISION,
    "depth_score" DOUBLE PRECISION,
    "novelty_score" DOUBLE PRECISION,
    "recognition_score" DOUBLE PRECISION,
    "source_type" TEXT,
    "source_reference" TEXT,
    "status" "InsightStatus" NOT NULL DEFAULT 'candidate',
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "human_insights_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "insight_sources" (
    "id" TEXT NOT NULL,
    "insight_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "reference" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "insight_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "concepts" (
    "id" TEXT NOT NULL,
    "insight_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "angle" TEXT,
    "hook" TEXT,
    "thesis" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "concepts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_assets" (
    "id" TEXT NOT NULL,
    "concept_id" TEXT,
    "page_id" TEXT,
    "title" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "body" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "content_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_genomes" (
    "id" TEXT NOT NULL,
    "content_asset_id" TEXT NOT NULL,
    "primary_conflict" TEXT,
    "secondary_conflicts" JSONB,
    "primary_emotion" TEXT,
    "secondary_emotion" TEXT,
    "audience_wounds" JSONB,
    "lenses" JSONB,
    "tones" JSONB,
    "depth_level" TEXT,
    "structure" TEXT,
    "visual_metaphor" TEXT,
    "ending_type" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "content_genomes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "visual_concepts" (
    "id" TEXT NOT NULL,
    "content_asset_id" TEXT,
    "title" TEXT NOT NULL,
    "metaphor" TEXT,
    "style" TEXT,
    "palette" JSONB,
    "composition" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "visual_concepts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "visual_assets" (
    "id" TEXT NOT NULL,
    "visual_concept_id" TEXT NOT NULL,
    "url" TEXT,
    "kind" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "visual_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quality_reviews" (
    "id" TEXT NOT NULL,
    "content_asset_id" TEXT NOT NULL,
    "reviewer" TEXT NOT NULL,
    "score" DOUBLE PRECISION,
    "verdict" TEXT NOT NULL,
    "notes" TEXT,
    "criteria" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quality_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "duplicate_checks" (
    "id" TEXT NOT NULL,
    "content_asset_id" TEXT NOT NULL,
    "compared_to_id" TEXT,
    "similarity" DOUBLE PRECISION,
    "verdict" TEXT NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "duplicate_checks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_queue" (
    "id" TEXT NOT NULL,
    "content_asset_id" TEXT,
    "page_id" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "scheduled_for" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "content_queue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "publication_records" (
    "id" TEXT NOT NULL,
    "content_asset_id" TEXT NOT NULL,
    "page_id" TEXT,
    "platform" TEXT NOT NULL,
    "external_id" TEXT,
    "url" TEXT,
    "published_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,

    CONSTRAINT "publication_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "performance_metrics" (
    "id" TEXT NOT NULL,
    "content_asset_id" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "captured_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,

    CONSTRAINT "performance_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feedback_events" (
    "id" TEXT NOT NULL,
    "object_type" TEXT NOT NULL,
    "object_id" TEXT NOT NULL,
    "action" "FeedbackAction" NOT NULL,
    "reason" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "insight_id" TEXT,

    CONSTRAINT "feedback_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idea_vault" (
    "id" TEXT NOT NULL,
    "insight_id" TEXT NOT NULL,
    "tier" TEXT NOT NULL DEFAULT 'standard',
    "tags" JSONB,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "idea_vault_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prompt_versions" (
    "id" TEXT NOT NULL,
    "agent" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "prompt_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_runs" (
    "id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "agent" TEXT NOT NULL,
    "status" "AgentRunStatus" NOT NULL DEFAULT 'pending',
    "input" JSONB,
    "output" JSONB,
    "error" TEXT,
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "run_logs" (
    "id" TEXT NOT NULL,
    "agent_run_id" TEXT NOT NULL,
    "level" TEXT NOT NULL DEFAULT 'info',
    "message" TEXT NOT NULL,
    "data" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "run_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pages_slug_key" ON "pages"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "page_dna_page_id_key" ON "page_dna"("page_id");

-- CreateIndex
CREATE UNIQUE INDEX "taxonomy_categories_slug_key" ON "taxonomy_categories"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "taxonomy_nodes_category_id_slug_key" ON "taxonomy_nodes"("category_id", "slug");

-- CreateIndex
CREATE INDEX "human_insights_status_idx" ON "human_insights"("status");

-- CreateIndex
CREATE INDEX "human_insights_primary_conflict_id_idx" ON "human_insights"("primary_conflict_id");

-- CreateIndex
CREATE INDEX "concepts_insight_id_idx" ON "concepts"("insight_id");

-- CreateIndex
CREATE INDEX "content_assets_concept_id_idx" ON "content_assets"("concept_id");

-- CreateIndex
CREATE INDEX "content_assets_page_id_idx" ON "content_assets"("page_id");

-- CreateIndex
CREATE UNIQUE INDEX "content_genomes_content_asset_id_key" ON "content_genomes"("content_asset_id");

-- CreateIndex
CREATE INDEX "performance_metrics_content_asset_id_metric_idx" ON "performance_metrics"("content_asset_id", "metric");

-- CreateIndex
CREATE INDEX "feedback_events_object_type_object_id_idx" ON "feedback_events"("object_type", "object_id");

-- CreateIndex
CREATE UNIQUE INDEX "idea_vault_insight_id_key" ON "idea_vault"("insight_id");

-- CreateIndex
CREATE UNIQUE INDEX "prompt_versions_agent_version_key" ON "prompt_versions"("agent", "version");

-- CreateIndex
CREATE UNIQUE INDEX "agent_runs_run_id_key" ON "agent_runs"("run_id");

-- CreateIndex
CREATE INDEX "agent_runs_agent_status_idx" ON "agent_runs"("agent", "status");

-- CreateIndex
CREATE INDEX "run_logs_agent_run_id_idx" ON "run_logs"("agent_run_id");

-- AddForeignKey
ALTER TABLE "page_dna" ADD CONSTRAINT "page_dna_page_id_fkey" FOREIGN KEY ("page_id") REFERENCES "pages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "taxonomy_nodes" ADD CONSTRAINT "taxonomy_nodes_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "taxonomy_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insight_sources" ADD CONSTRAINT "insight_sources_insight_id_fkey" FOREIGN KEY ("insight_id") REFERENCES "human_insights"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "concepts" ADD CONSTRAINT "concepts_insight_id_fkey" FOREIGN KEY ("insight_id") REFERENCES "human_insights"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_assets" ADD CONSTRAINT "content_assets_concept_id_fkey" FOREIGN KEY ("concept_id") REFERENCES "concepts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_assets" ADD CONSTRAINT "content_assets_page_id_fkey" FOREIGN KEY ("page_id") REFERENCES "pages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_genomes" ADD CONSTRAINT "content_genomes_content_asset_id_fkey" FOREIGN KEY ("content_asset_id") REFERENCES "content_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visual_concepts" ADD CONSTRAINT "visual_concepts_content_asset_id_fkey" FOREIGN KEY ("content_asset_id") REFERENCES "content_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visual_assets" ADD CONSTRAINT "visual_assets_visual_concept_id_fkey" FOREIGN KEY ("visual_concept_id") REFERENCES "visual_concepts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quality_reviews" ADD CONSTRAINT "quality_reviews_content_asset_id_fkey" FOREIGN KEY ("content_asset_id") REFERENCES "content_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "duplicate_checks" ADD CONSTRAINT "duplicate_checks_content_asset_id_fkey" FOREIGN KEY ("content_asset_id") REFERENCES "content_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_queue" ADD CONSTRAINT "content_queue_content_asset_id_fkey" FOREIGN KEY ("content_asset_id") REFERENCES "content_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_queue" ADD CONSTRAINT "content_queue_page_id_fkey" FOREIGN KEY ("page_id") REFERENCES "pages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publication_records" ADD CONSTRAINT "publication_records_content_asset_id_fkey" FOREIGN KEY ("content_asset_id") REFERENCES "content_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publication_records" ADD CONSTRAINT "publication_records_page_id_fkey" FOREIGN KEY ("page_id") REFERENCES "pages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "performance_metrics" ADD CONSTRAINT "performance_metrics_content_asset_id_fkey" FOREIGN KEY ("content_asset_id") REFERENCES "content_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedback_events" ADD CONSTRAINT "feedback_events_insight_id_fkey" FOREIGN KEY ("insight_id") REFERENCES "human_insights"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "idea_vault" ADD CONSTRAINT "idea_vault_insight_id_fkey" FOREIGN KEY ("insight_id") REFERENCES "human_insights"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "run_logs" ADD CONSTRAINT "run_logs_agent_run_id_fkey" FOREIGN KEY ("agent_run_id") REFERENCES "agent_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
