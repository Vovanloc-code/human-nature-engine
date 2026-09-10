/**
 * Phase 3+4 production pipeline: Concept → Writer → Visual Director → Dedup Judge
 * → content_asset + genome + visual_concept + embeddings + duplicate_checks.
 */

import { prisma } from "@/db";
import { writeContent } from "@/agents/writer";
import { directVisual } from "@/agents/visual-director";
import { architectConcepts } from "@/agents/concept-architect";
import {
  allocateRunId,
  startAgentRun,
  finishAgentRun,
  appendRunLog,
} from "@/engine/runs";
import { seedPhase3Prompts, seedPhase4Prompts } from "@/prompts";
import { judgeDuplicates } from "@/agents/dedup-judge";
import {
  embedInsightRecord,
  embedConceptRecord,
  embedContentAssetRecord,
  embedVisualConceptRecord,
} from "@/engine/embeddings";
import type { WriterDraft, VisualDirection, ConceptDraft } from "@/agents/types";
import type { DedupJudgeResult } from "@/agents/dedup-judge";

export type ProductionPipelineOpts = {
  insightId?: string;
  conceptId?: string;
  pageSlug?: string;
  pageId?: string;
  format?: WriterDraft["format"];
  platform?: string;
  language?: string;
  persist?: boolean;
  /** If insight given and no conceptId, architect N concepts and produce the first */
  conceptCount?: number;
  runId?: string;
  /** Run Dedup Judge after writing/visual (Phase 4). Default true when persist. */
  dedup?: boolean;
};

export type ProductionPipelineResult = {
  runId: string;
  insightId: string;
  conceptId: string;
  concepts?: ConceptDraft[];
  draft: WriterDraft;
  contentAssetId?: string;
  genomeId?: string;
  direction: VisualDirection;
  visualConceptId?: string;
  visualAssetId?: string;
  provider: string;
  dedup?: DedupJudgeResult;
};

export async function runProductionPipeline(
  opts: ProductionPipelineOpts
): Promise<ProductionPipelineResult> {
  await seedPhase3Prompts();
  await seedPhase4Prompts();

  const persist = opts.persist !== false;
  const runId = opts.runId ?? (await allocateRunId());
  const pipelineRun = await startAgentRun({
    agent: "production-pipeline",
    runId,
    input: {
      insightId: opts.insightId,
      conceptId: opts.conceptId,
      pageSlug: opts.pageSlug,
      format: opts.format,
    },
  });

  try {
    let conceptId = opts.conceptId;
    let insightId = opts.insightId;
    let concepts: ConceptDraft[] | undefined;

    if (!conceptId) {
      if (!insightId) {
        throw new Error("production pipeline requires --insight or --concept");
      }
      const insight = await prisma.humanInsight.findUnique({ where: { id: insightId } });
      if (!insight) throw new Error(`Insight not found: ${insightId}`);
      if (insight.status !== "approved" && insight.status !== "used") {
        throw new Error(
          `Production requires approved/used insight; got status=${insight.status}`
        );
      }

      await appendRunLog(pipelineRun.id, "info", "Architecting concepts for production", {
        insightId,
      });

      const arch = await architectConcepts({
        insightId,
        count: opts.conceptCount ?? 3,
        persist,
      });
      concepts = arch.concepts;
      if (persist && arch.persistedIds[0]) {
        conceptId = arch.persistedIds[0];
      } else if (!persist) {
        // Persist a single concept so Writer FK works, even when caller asked no-persist for assets…
        // For true no-persist tests we still need a concept row if Writer requires conceptId.
        const row = await prisma.concept.create({
          data: {
            insightId,
            title: arch.concepts[0]!.title,
            angle: arch.concepts[0]!.angle,
            hook: arch.concepts[0]!.hook,
            thesis: arch.concepts[0]!.thesis,
            status: "draft",
            metadata: {
              domain: arch.concepts[0]!.domain,
              audience: arch.concepts[0]!.audience,
              format: arch.concepts[0]!.format,
              lens: arch.concepts[0]!.lens,
              metaphor: arch.concepts[0]!.metaphor,
              structure: arch.concepts[0]!.structure,
              ending: arch.concepts[0]!.ending,
              ephemeral: true,
            },
          },
        });
        conceptId = row.id;
      } else {
        throw new Error("Architect produced no persisted concept id");
      }

      await appendRunLog(
        pipelineRun.id,
        "info",
        `Using concept ${conceptId} (${arch.concepts[0]?.title ?? ""})`
      );
    } else {
      const concept = await prisma.concept.findUnique({
        where: { id: conceptId },
        include: { insight: true },
      });
      if (!concept) throw new Error(`Concept not found: ${conceptId}`);
      insightId = concept.insightId;
    }

    if (!insightId) throw new Error("Could not resolve insightId");

    await appendRunLog(pipelineRun.id, "info", "Starting Writer", { conceptId });
    const written = await writeContent({
      conceptId,
      pageSlug: opts.pageSlug,
      pageId: opts.pageId,
      format: opts.format,
      platform: opts.platform,
      language: opts.language,
      persist,
    });

    await appendRunLog(pipelineRun.id, "info", "Writer draft ready", {
      contentAssetId: written.contentAssetId,
      format: written.draft.format,
      headline: written.draft.headline,
    });

    if (!written.contentAssetId) {
      throw new Error("Writer did not persist content asset (required for Visual Director)");
    }

    await appendRunLog(pipelineRun.id, "info", "Starting Visual Director", {
      contentAssetId: written.contentAssetId,
    });

    const visual = await directVisual({
      contentAssetId: written.contentAssetId,
      pageSlug: opts.pageSlug,
      persist,
    });

    await appendRunLog(pipelineRun.id, "info", "Visual concept ready", {
      visualConceptId: visual.visualConceptId,
      universe: visual.direction.universe,
    });

    // Phase 4: persist embeddings + optional Dedup Judge
    let dedupResult: DedupJudgeResult | undefined;
    if (persist) {
      const insightRow = await prisma.humanInsight.findUnique({ where: { id: insightId } });
      if (insightRow) await embedInsightRecord(insightRow);
      const conceptRow = await prisma.concept.findUnique({ where: { id: conceptId } });
      if (conceptRow) await embedConceptRecord(conceptRow);
      const assetRow = await prisma.contentAsset.findUnique({
        where: { id: written.contentAssetId },
      });
      if (assetRow) await embedContentAssetRecord(assetRow);
      if (visual.visualConceptId) {
        const vc = await prisma.visualConcept.findUnique({
          where: { id: visual.visualConceptId },
        });
        if (vc) await embedVisualConceptRecord(vc);
      }

      const runDedup = opts.dedup !== false;
      if (runDedup) {
        await appendRunLog(pipelineRun.id, "info", "Starting Dedup Judge", {
          contentAssetId: written.contentAssetId,
        });
        dedupResult = await judgeDuplicates({
          contentAssetId: written.contentAssetId,
          persist: true,
          ensureEmbeddings: true,
        });
        await appendRunLog(pipelineRun.id, "info", "Dedup Judge complete", {
          primaryVerdict: dedupResult.primary?.verdict,
          pairCount: dedupResult.pairs.length,
          combined: dedupResult.primary?.combined,
        });
      }
    }

    const output = {
      insightId,
      conceptId,
      contentAssetId: written.contentAssetId,
      genomeId: written.genomeId,
      visualConceptId: visual.visualConceptId,
      provider: written.provider,
      dedupVerdict: dedupResult?.primary?.verdict,
      dedupCombined: dedupResult?.primary?.combined,
    };

    await finishAgentRun(pipelineRun.id, "succeeded", output);

    return {
      runId,
      insightId,
      conceptId,
      concepts,
      draft: written.draft,
      contentAssetId: written.contentAssetId,
      genomeId: written.genomeId,
      direction: visual.direction,
      visualConceptId: visual.visualConceptId,
      visualAssetId: visual.visualAssetId,
      provider: written.provider,
      dedup: dedupResult,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await finishAgentRun(pipelineRun.id, "failed", undefined, msg);
    throw e;
  }
}
