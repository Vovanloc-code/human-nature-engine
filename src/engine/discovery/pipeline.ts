/**
 * Phase 2 discovery pipeline: Scout → Critic → (optional) Concept Architect.
 * Logs via agent_runs / run_logs.
 */

import { createInsight } from "./insights";
import { prisma } from "@/db";
import { scoutInsights } from "@/agents/insight-scout";
import { scoreInsight } from "@/agents/insight-critic";
import { architectConcepts } from "@/agents/concept-architect";
import {
  allocateRunId,
  startAgentRun,
  finishAgentRun,
  appendRunLog,
} from "@/engine/runs";
import { seedPhase2Prompts, seedPhase4Prompts } from "@/prompts";
import type { ConceptDraft, CriticResult, InsightCandidate, WriterDraft, VisualDirection } from "@/agents/types";
import { runProductionPipeline } from "@/engine/production/pipeline";
import { judgeDuplicates } from "@/agents/dedup-judge";
import { embedInsightRecord } from "@/engine/embeddings";
import type { DedupJudgeResult } from "@/agents/dedup-judge";

export type DiscoveryPipelineOpts = {
  taxonomyArea: string;
  count?: number;
  pageSlug?: string;
  pageGoals?: string[];
  /** Persist approved insights to DB */
  persistInsights?: boolean;
  /** Run concept architect on first approved insight */
  buildConcepts?: boolean;
  conceptCount?: number;
  persistConcepts?: boolean;
  /** Phase 3: after concepts, run Writer → Visual on first concept */
  produceContent?: boolean;
  produceFormat?: WriterDraft["format"];
  runId?: string;
  /** Phase 4: after scout/persist, embed + optional insight dedup */
  dedupInsights?: boolean;
};

export type DiscoveryPipelineResult = {
  runId: string;
  provider: string;
  candidates: InsightCandidate[];
  critiques: Array<{ candidate: InsightCandidate; critique: CriticResult }>;
  approved: Array<{ candidate: InsightCandidate; critique: CriticResult; insightId?: string }>;
  rejected: Array<{ candidate: InsightCandidate; critique: CriticResult }>;
  concepts: ConceptDraft[];
  conceptInsightId?: string;
  production?: {
    contentAssetId?: string;
    genomeId?: string;
    visualConceptId?: string;
    draft?: WriterDraft;
    direction?: VisualDirection;
  };
  insightDedup?: Array<{ insightId: string; result: DedupJudgeResult }>;
};

export async function runDiscoveryPipeline(
  opts: DiscoveryPipelineOpts
): Promise<DiscoveryPipelineResult> {
  await seedPhase2Prompts();
  await seedPhase4Prompts();

  const runId = opts.runId ?? (await allocateRunId());
  const pipelineRun = await startAgentRun({
    agent: "discovery-pipeline",
    runId,
    input: {
      taxonomyArea: opts.taxonomyArea,
      count: opts.count,
      pageSlug: opts.pageSlug,
      buildConcepts: opts.buildConcepts ?? false,
    },
  });

  try {
    await appendRunLog(pipelineRun.id, "info", "Starting Insight Scout", {
      area: opts.taxonomyArea,
    });

    const scout = await scoutInsights({
      taxonomyArea: opts.taxonomyArea,
      count: opts.count ?? 8,
      pageSlug: opts.pageSlug,
      pageGoals: opts.pageGoals,
    });

    await appendRunLog(pipelineRun.id, "info", `Scout returned ${scout.candidates.length} candidates`, {
      provider: scout.provider,
      promptVersion: scout.promptVersion,
    });

    const critiques: DiscoveryPipelineResult["critiques"] = [];
    const approved: DiscoveryPipelineResult["approved"] = [];
    const rejected: DiscoveryPipelineResult["rejected"] = [];

    for (const candidate of scout.candidates) {
      const critique = scoreInsight(candidate);
      critiques.push({ candidate, critique });
      if (critique.approved) {
        let insightId: string | undefined;
        if (opts.persistInsights !== false) {
          const row = await createInsight({
            statement: candidate.statement,
            observation: candidate.observation,
            desire: candidate.desire,
            hiddenFear: candidate.hidden_fear,
            contradictoryBehavior:
              candidate.contradiction ?? candidate.contradictory_behavior,
            cost: candidate.cost,
            primaryConflictId: candidate.primaryConflictId,
            status: "approved",
            sourceType: "scout",
            sourceReference: runId,
            recognitionScore: critique.scores.humanRecognition / 20,
            noveltyScore: critique.scores.originality / 20,
            depthScore: critique.scores.emotionalPrecision / 15,
            universalityScore: critique.scores.evergreenValue / 10,
            metadata: {
              critic: critique,
              lens: candidate.lens,
              scout: candidate.metadata,
              pipelineRunId: runId,
            },
          });
          insightId = row.id;
        }
        approved.push({ candidate, critique, insightId });
      } else {
        rejected.push({ candidate, critique });
      }
    }

    await appendRunLog(
      pipelineRun.id,
      "info",
      `Critic: approved=${approved.length} rejected=${rejected.length}`
    );

    // Phase 4 (optional): embed approved insights + light memory dedup
    const insightDedup: DiscoveryPipelineResult["insightDedup"] = [];
    if (opts.persistInsights !== false) {
      for (const row of approved) {
        if (!row.insightId) continue;
        const insight = await prisma.humanInsight.findUnique({
          where: { id: row.insightId },
        });
        if (insight) await embedInsightRecord(insight);
      }
      if (opts.dedupInsights) {
        for (const row of approved.slice(0, 3)) {
          if (!row.insightId) continue;
          const result = await judgeDuplicates({
            insightId: row.insightId,
            persist: true,
            candidateLimit: 5,
          });
          insightDedup.push({ insightId: row.insightId, result });
        }
        await appendRunLog(pipelineRun.id, "info", `Insight dedup ran on ${insightDedup.length} approvals`);
      }
    }

    let concepts: ConceptDraft[] = [];
    let conceptInsightId: string | undefined;
    let persistedConceptIds: string[] = [];

    if (opts.buildConcepts && approved.length > 0) {
      const first = approved[0]!;
      // Need a persisted approved insight for architect
      let insightId = first.insightId;
      if (!insightId) {
        const row = await createInsight({
          statement: first.candidate.statement,
          observation: first.candidate.observation,
          desire: first.candidate.desire,
          hiddenFear: first.candidate.hidden_fear,
          contradictoryBehavior:
            first.candidate.contradiction ?? first.candidate.contradictory_behavior,
          cost: first.candidate.cost,
          primaryConflictId: first.candidate.primaryConflictId,
          status: "approved",
          sourceType: "scout",
          sourceReference: runId,
        });
        insightId = row.id;
        first.insightId = insightId;
      }
      conceptInsightId = insightId;

      await appendRunLog(pipelineRun.id, "info", "Starting Concept Architect", {
        insightId,
      });

      const arch = await architectConcepts({
        insightId,
        count: opts.conceptCount ?? 5,
        persist: opts.persistConcepts ?? false,
      });
      concepts = arch.concepts;
      persistedConceptIds = arch.persistedIds;

      await appendRunLog(
        pipelineRun.id,
        "info",
        `Architect produced ${concepts.length} concepts`
      );
    }

    let production: DiscoveryPipelineResult["production"];

    if (opts.produceContent && conceptInsightId) {
      await appendRunLog(pipelineRun.id, "info", "Starting production (Writer → Visual)");
      const produced = await runProductionPipeline({
        insightId: persistedConceptIds[0] ? undefined : conceptInsightId,
        conceptId: persistedConceptIds[0],
        pageSlug: opts.pageSlug,
        format: opts.produceFormat,
        persist: true,
        runId: `${runId}-produce`,
      });
      production = {
        contentAssetId: produced.contentAssetId,
        genomeId: produced.genomeId,
        visualConceptId: produced.visualConceptId,
        draft: produced.draft,
        direction: produced.direction,
      };
      // Prefer architect concepts from earlier; if empty, use production concepts
      if (concepts.length === 0 && produced.concepts) {
        concepts = produced.concepts;
      }
      await appendRunLog(pipelineRun.id, "info", "Production complete", {
        contentAssetId: production.contentAssetId,
        visualConceptId: production.visualConceptId,
      });
    }

    const output = {
      candidateCount: scout.candidates.length,
      approvedCount: approved.length,
      rejectedCount: rejected.length,
      conceptCount: concepts.length,
      provider: scout.provider,
      produced: Boolean(production),
    };

    await finishAgentRun(pipelineRun.id, "succeeded", output);

    return {
      runId,
      provider: scout.provider,
      candidates: scout.candidates,
      critiques,
      approved,
      rejected,
      concepts,
      conceptInsightId,
      production,
      insightDedup,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await finishAgentRun(pipelineRun.id, "failed", undefined, msg);
    throw e;
  }
}
