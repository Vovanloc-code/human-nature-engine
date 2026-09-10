/**
 * A7 Dedup Judge — semantic duplicate detection (Phase 4 Memory).
 * Compares meaning (insight / genome / text / visual), not wording alone.
 */

import type { Agent, AgentInput, AgentOutput } from "../types";
import { prisma } from "@/db";
import { getProvider } from "@/providers";
import { getActivePrompt } from "@/prompts";
import {
  allocateRunId,
  startAgentRun,
  finishAgentRun,
  appendRunLog,
} from "@/engine/runs";
import {
  DEFAULT_DEDUP_THRESHOLDS,
  type DedupThresholds,
  type DedupVerdict,
  type SimilarityBreakdown,
  type GenomeFields,
  insightFieldSimilarity,
  genomeSimilarity,
  textSimilarity,
  visualSimilarity,
  serializeGenome,
  judgeFromSimilarities,
  vectorSimilarity,
} from "@/engine/dedup";
import {
  embedInsightRecord,
  embedConceptRecord,
  embedContentAssetRecord,
  embedVisualConceptRecord,
  embedTexts,
  getEmbedding,
  searchSimilarInsights,
} from "@/engine/embeddings";

export type DedupJudgeInput = {
  /** Content asset to judge (production path) */
  contentAssetId?: string;
  /** Insight to judge (scout / insight path) */
  insightId?: string;
  /** Explicit comparison target content asset */
  comparedToId?: string;
  /** Explicit comparison target insight */
  comparedInsightId?: string;
  /** Limit of auto-found candidates via embeddings */
  candidateLimit?: number;
  thresholds?: Partial<DedupThresholds>;
  persist?: boolean;
  /** Also embed related records when judging */
  ensureEmbeddings?: boolean;
  runId?: string;
};

export type DedupPairResult = {
  comparedToId?: string;
  comparedInsightId?: string;
  similarities: SimilarityBreakdown;
  combined: number;
  verdict: DedupVerdict;
  reason: string;
  duplicateCheckId?: string;
  dimensions: Record<string, number>;
};

export type DedupJudgeResult = {
  runId: string;
  contentAssetId?: string;
  insightId?: string;
  pairs: DedupPairResult[];
  /** Worst (most duplicate-like) pair */
  primary?: DedupPairResult;
  provider: string;
  promptVersion: string;
  thresholds: DedupThresholds;
};

function mergeThresholds(
  partial?: Partial<DedupThresholds>
): DedupThresholds {
  return {
    hardDuplicate:
      partial?.hardDuplicate ?? DEFAULT_DEDUP_THRESHOLDS.hardDuplicate,
    rewriteZone: partial?.rewriteZone ?? DEFAULT_DEDUP_THRESHOLDS.rewriteZone,
  };
}

async function loadAssetBundle(contentAssetId: string) {
  const asset = await prisma.contentAsset.findUnique({
    where: { id: contentAssetId },
    include: {
      genome: true,
      visualConcepts: { orderBy: { createdAt: "desc" }, take: 1 },
      concept: { include: { insight: true } },
    },
  });
  if (!asset) throw new Error(`Content asset not found: ${contentAssetId}`);
  return asset;
}

async function ensureAssetEmbeddings(
  asset: Awaited<ReturnType<typeof loadAssetBundle>>
) {
  await embedContentAssetRecord(asset);
  if (asset.concept) {
    await embedConceptRecord(asset.concept);
    if (asset.concept.insight) {
      await embedInsightRecord(asset.concept.insight);
    }
  }
  const visual = asset.visualConcepts[0];
  if (visual) {
    await embedVisualConceptRecord(visual);
  }
}

function assetText(asset: {
  title: string;
  body?: string | null;
  metadata?: unknown;
}): string {
  const meta = (asset.metadata ?? {}) as Record<string, unknown>;
  return [asset.title, asset.body, meta.hook, meta.caption, meta.image_text]
    .filter(Boolean)
    .join("\n");
}

function genomeFromRow(
  g:
    | {
        primaryConflict?: string | null;
        secondaryConflicts?: unknown;
        primaryEmotion?: string | null;
        secondaryEmotion?: string | null;
        lenses?: unknown;
        structure?: string | null;
        visualMetaphor?: string | null;
        endingType?: string | null;
        audienceWounds?: unknown;
        tones?: unknown;
        depthLevel?: string | null;
      }
    | null
    | undefined
): GenomeFields {
  if (!g) return {};
  return {
    primaryConflict: g.primaryConflict,
    secondaryConflicts: g.secondaryConflicts,
    primaryEmotion: g.primaryEmotion,
    secondaryEmotion: g.secondaryEmotion,
    lenses: g.lenses,
    structure: g.structure,
    visualMetaphor: g.visualMetaphor,
    endingType: g.endingType,
    audienceWounds: g.audienceWounds,
    tones: g.tones,
    depthLevel: g.depthLevel,
  };
}

async function compareAssets(
  a: Awaited<ReturnType<typeof loadAssetBundle>>,
  b: Awaited<ReturnType<typeof loadAssetBundle>>
): Promise<Omit<DedupPairResult, "duplicateCheckId">> {
  const insightA = a.concept?.insight;
  const insightB = b.concept?.insight;

  const textA = assetText(a);
  const textB = assetText(b);

  const [textEmbeds, statementEmbeds, genomeEmbeds, visualEmbeds] =
    await Promise.all([
      embedTexts([textA, textB]),
      embedTexts([
        insightA?.statement ?? a.title,
        insightB?.statement ?? b.title,
      ]),
      embedTexts([
        serializeGenome(genomeFromRow(a.genome)),
        serializeGenome(genomeFromRow(b.genome)),
      ]),
      embedTexts([
        [
          a.visualConcepts[0]?.metaphor,
          a.visualConcepts[0]?.title,
          a.genome?.visualMetaphor,
        ]
          .filter(Boolean)
          .join(" "),
        [
          b.visualConcepts[0]?.metaphor,
          b.visualConcepts[0]?.title,
          b.genome?.visualMetaphor,
        ]
          .filter(Boolean)
          .join(" "),
      ]),
    ]);

  const textEmbedSim = vectorSimilarity(textEmbeds[0]!, textEmbeds[1]!);
  const insightEmbedSim = vectorSimilarity(
    statementEmbeds[0]!,
    statementEmbeds[1]!
  );
  const genomeEmbedSim = vectorSimilarity(genomeEmbeds[0]!, genomeEmbeds[1]!);
  const visualEmbedSim = vectorSimilarity(visualEmbeds[0]!, visualEmbeds[1]!);

  const TEXT_SIMILARITY = textSimilarity(textA, textB, textEmbedSim);
  const INSIGHT_SIMILARITY = insightFieldSimilarity(
    {
      statement: insightA?.statement,
      observation: insightA?.observation,
      desire: insightA?.desire,
      hiddenFear: insightA?.hiddenFear,
      contradictoryBehavior: insightA?.contradictoryBehavior,
      cost: insightA?.cost,
      primaryConflictId: insightA?.primaryConflictId,
      secondaryConflicts: insightA?.secondaryConflicts,
    },
    {
      statement: insightB?.statement,
      observation: insightB?.observation,
      desire: insightB?.desire,
      hiddenFear: insightB?.hiddenFear,
      contradictoryBehavior: insightB?.contradictoryBehavior,
      cost: insightB?.cost,
      primaryConflictId: insightB?.primaryConflictId,
      secondaryConflicts: insightB?.secondaryConflicts,
    },
    insightEmbedSim
  );

  const GENOME_SIMILARITY = genomeSimilarity(
    genomeFromRow(a.genome),
    genomeFromRow(b.genome),
    genomeEmbedSim
  );

  const metaA = (a.visualConcepts[0]?.metadata ?? {}) as Record<string, unknown>;
  const metaB = (b.visualConcepts[0]?.metadata ?? {}) as Record<string, unknown>;
  const VISUAL_SIMILARITY = visualSimilarity(
    {
      metaphor: a.visualConcepts[0]?.metaphor ?? a.genome?.visualMetaphor,
      title: a.visualConcepts[0]?.title,
      universe: typeof metaA.universe === "string" ? metaA.universe : null,
    },
    {
      metaphor: b.visualConcepts[0]?.metaphor ?? b.genome?.visualMetaphor,
      title: b.visualConcepts[0]?.title,
      universe: typeof metaB.universe === "string" ? metaB.universe : null,
    },
    visualEmbedSim
  );

  const similarities: SimilarityBreakdown = {
    TEXT_SIMILARITY,
    INSIGHT_SIMILARITY,
    GENOME_SIMILARITY,
    VISUAL_SIMILARITY,
  };

  const judged = judgeFromSimilarities(similarities);

  return {
    comparedToId: b.id,
    comparedInsightId: insightB?.id,
    similarities,
    combined: judged.combined,
    verdict: judged.verdict,
    reason: judged.reason,
    dimensions: {
      core_semantic_insight: INSIGHT_SIMILARITY,
      primary_conflict: insightA?.primaryConflictId === insightB?.primaryConflictId ? 1 : 0,
      hidden_motive: insightFieldSimilarity(
        { hiddenFear: insightA?.hiddenFear },
        { hiddenFear: insightB?.hiddenFear },
        undefined
      ),
      contradiction: insightFieldSimilarity(
        { contradictoryBehavior: insightA?.contradictoryBehavior },
        { contradictoryBehavior: insightB?.contradictoryBehavior },
        undefined
      ),
      emotional_arc: genomeSimilarity(
        { primaryEmotion: a.genome?.primaryEmotion, secondaryEmotion: a.genome?.secondaryEmotion },
        { primaryEmotion: b.genome?.primaryEmotion, secondaryEmotion: b.genome?.secondaryEmotion }
      ),
      hook_pattern: textSimilarity(
        String((a.metadata as Record<string, unknown> | null)?.hook ?? a.concept?.hook ?? ""),
        String((b.metadata as Record<string, unknown> | null)?.hook ?? b.concept?.hook ?? ""),
        undefined
      ),
      visual_metaphor: VISUAL_SIMILARITY,
      lens: genomeSimilarity(
        { lenses: a.genome?.lenses },
        { lenses: b.genome?.lenses }
      ),
      ending: genomeSimilarity(
        { endingType: a.genome?.endingType },
        { endingType: b.genome?.endingType }
      ),
    },
  };
}

async function compareInsights(
  aId: string,
  bId: string
): Promise<Omit<DedupPairResult, "duplicateCheckId">> {
  const [a, b] = await Promise.all([
    prisma.humanInsight.findUnique({ where: { id: aId } }),
    prisma.humanInsight.findUnique({ where: { id: bId } }),
  ]);
  if (!a) throw new Error(`Insight not found: ${aId}`);
  if (!b) throw new Error(`Insight not found: ${bId}`);

  await embedInsightRecord(a);
  await embedInsightRecord(b);

  const fullA = [
    a.statement,
    a.observation,
    a.desire,
    a.hiddenFear,
    a.contradictoryBehavior,
    a.cost,
    a.primaryConflictId,
  ]
    .filter(Boolean)
    .join("\n");
  const fullB = [
    b.statement,
    b.observation,
    b.desire,
    b.hiddenFear,
    b.contradictoryBehavior,
    b.cost,
    b.primaryConflictId,
  ]
    .filter(Boolean)
    .join("\n");

  const [statementEmbeds, fullEmbeds] = await Promise.all([
    embedTexts([a.statement, b.statement]),
    embedTexts([fullA, fullB]),
  ]);

  const statementSim = vectorSimilarity(statementEmbeds[0]!, statementEmbeds[1]!);
  const fullSim = vectorSimilarity(fullEmbeds[0]!, fullEmbeds[1]!);
  // Prefer full semantic signal for insight similarity (paraphrase-aware)
  const semanticSim = Math.max(statementSim, fullSim);

  const INSIGHT_SIMILARITY = insightFieldSimilarity(
    {
      statement: a.statement,
      observation: a.observation,
      desire: a.desire,
      hiddenFear: a.hiddenFear,
      contradictoryBehavior: a.contradictoryBehavior,
      cost: a.cost,
      primaryConflictId: a.primaryConflictId,
      secondaryConflicts: a.secondaryConflicts,
    },
    {
      statement: b.statement,
      observation: b.observation,
      desire: b.desire,
      hiddenFear: b.hiddenFear,
      contradictoryBehavior: b.contradictoryBehavior,
      cost: b.cost,
      primaryConflictId: b.primaryConflictId,
      secondaryConflicts: b.secondaryConflicts,
    },
    semanticSim
  );

  const TEXT_SIMILARITY = textSimilarity(a.statement, b.statement, fullSim);

  // Synthetic genome from insight fields for contribution
  const genomeA: GenomeFields = {
    primaryConflict: a.primaryConflictId,
    secondaryConflicts: a.secondaryConflicts,
    primaryEmotion: undefined,
    visualMetaphor: undefined,
    endingType: undefined,
    structure: undefined,
    lenses: undefined,
  };
  const genomeB: GenomeFields = {
    primaryConflict: b.primaryConflictId,
    secondaryConflicts: b.secondaryConflicts,
  };
  const GENOME_SIMILARITY = genomeSimilarity(genomeA, genomeB, statementSim * 0.5);
  const VISUAL_SIMILARITY = 0;

  const similarities: SimilarityBreakdown = {
    TEXT_SIMILARITY,
    INSIGHT_SIMILARITY,
    GENOME_SIMILARITY,
    VISUAL_SIMILARITY,
  };
  const judged = judgeFromSimilarities(similarities);

  return {
    comparedInsightId: b.id,
    similarities,
    combined: judged.combined,
    verdict: judged.verdict,
    reason: judged.reason,
    dimensions: {
      core_semantic_insight: INSIGHT_SIMILARITY,
      primary_conflict:
        a.primaryConflictId && a.primaryConflictId === b.primaryConflictId ? 1 : 0,
      hidden_motive: insightFieldSimilarity(
        { hiddenFear: a.hiddenFear },
        { hiddenFear: b.hiddenFear }
      ),
      contradiction: insightFieldSimilarity(
        { contradictoryBehavior: a.contradictoryBehavior },
        { contradictoryBehavior: b.contradictoryBehavior }
      ),
    },
  };
}

async function persistCheck(opts: {
  contentAssetId?: string;
  comparedToId?: string;
  insightId?: string;
  comparedInsightId?: string;
  pair: Omit<DedupPairResult, "duplicateCheckId">;
  thresholds: DedupThresholds;
}): Promise<string> {
  const row = await prisma.duplicateCheck.create({
    data: {
      contentAssetId: opts.contentAssetId,
      comparedToId: opts.comparedToId,
      insightId: opts.insightId,
      comparedInsightId: opts.comparedInsightId,
      similarity: opts.pair.combined,
      textSimilarity: opts.pair.similarities.TEXT_SIMILARITY,
      insightSimilarity: opts.pair.similarities.INSIGHT_SIMILARITY,
      genomeSimilarity: opts.pair.similarities.GENOME_SIMILARITY,
      visualSimilarity: opts.pair.similarities.VISUAL_SIMILARITY,
      verdict: opts.pair.verdict,
      notes: opts.pair.reason,
      details: {
        dimensions: opts.pair.dimensions,
        thresholds: opts.thresholds,
        similarities: opts.pair.similarities,
      },
    },
  });
  return row.id;
}

export async function judgeDuplicates(
  input: DedupJudgeInput
): Promise<DedupJudgeResult> {
  const thresholds = mergeThresholds(input.thresholds);
  const persist = input.persist !== false;
  const ensure = input.ensureEmbeddings !== false;
  const provider = getProvider();
  const prompt = await getActivePrompt("dedup-judge");
  const runId = input.runId ?? (await allocateRunId());

  const agentRun = await startAgentRun({
    agent: "dedup-judge",
    runId,
    input: {
      contentAssetId: input.contentAssetId,
      insightId: input.insightId,
      comparedToId: input.comparedToId,
      comparedInsightId: input.comparedInsightId,
    },
  });

  try {
    const pairs: DedupPairResult[] = [];

    if (input.contentAssetId) {
      const asset = await loadAssetBundle(input.contentAssetId);
      if (ensure) await ensureAssetEmbeddings(asset);

      const targets: string[] = [];
      if (input.comparedToId) {
        targets.push(input.comparedToId);
      } else {
        // Find candidates: other assets with embeddings, or same-page recent
        const others = await prisma.contentAsset.findMany({
          where: {
            id: { not: asset.id },
            ...(asset.pageId ? { pageId: asset.pageId } : {}),
          },
          orderBy: { createdAt: "desc" },
          take: input.candidateLimit ?? 12,
          select: { id: true },
        });
        targets.push(...others.map((o) => o.id));
      }

      await appendRunLog(agentRun.id, "info", `Comparing asset to ${targets.length} candidates`, {
        contentAssetId: asset.id,
      });

      for (const tid of targets) {
        if (tid === asset.id) continue;
        const other = await loadAssetBundle(tid);
        if (ensure) await ensureAssetEmbeddings(other);
        const pair = await compareAssets(asset, other);
        let duplicateCheckId: string | undefined;
        if (persist) {
          duplicateCheckId = await persistCheck({
            contentAssetId: asset.id,
            comparedToId: other.id,
            insightId: asset.concept?.insightId,
            comparedInsightId: other.concept?.insightId,
            pair,
            thresholds,
          });
        }
        pairs.push({ ...pair, duplicateCheckId });
      }
    } else if (input.insightId) {
      const insight = await prisma.humanInsight.findUnique({
        where: { id: input.insightId },
      });
      if (!insight) throw new Error(`Insight not found: ${input.insightId}`);
      if (ensure) await embedInsightRecord(insight);

      const targets: string[] = [];
      if (input.comparedInsightId) {
        targets.push(input.comparedInsightId);
      } else {
        const hits = await searchSimilarInsights(insight.statement, {
          limit: (input.candidateLimit ?? 8) + 1,
          minScore: 0.2,
        });
        for (const h of hits) {
          if (h.objectId !== insight.id) targets.push(h.objectId);
        }
        // Fallback: recent insights if embeddings sparse
        if (targets.length === 0) {
          const recent = await prisma.humanInsight.findMany({
            where: { id: { not: insight.id } },
            orderBy: { createdAt: "desc" },
            take: input.candidateLimit ?? 8,
            select: { id: true },
          });
          targets.push(...recent.map((r) => r.id));
        }
      }

      await appendRunLog(agentRun.id, "info", `Comparing insight to ${targets.length} candidates`, {
        insightId: insight.id,
      });

      for (const tid of targets) {
        const pair = await compareInsights(insight.id, tid);
        let duplicateCheckId: string | undefined;
        if (persist) {
          duplicateCheckId = await persistCheck({
            insightId: insight.id,
            comparedInsightId: tid,
            pair,
            thresholds,
          });
        }
        pairs.push({ ...pair, duplicateCheckId });
      }
    } else {
      throw new Error("dedup-judge requires contentAssetId or insightId");
    }

    // Sort worst-first (hard_duplicate > rewrite_zone > acceptable > distinct)
    const rank: Record<DedupVerdict, number> = {
      hard_duplicate: 0,
      rewrite_zone: 1,
      acceptable: 2,
      distinct: 3,
    };
    pairs.sort((x, y) => {
      const rd = rank[x.verdict] - rank[y.verdict];
      if (rd !== 0) return rd;
      return y.combined - x.combined;
    });

    const primary = pairs[0];
    await finishAgentRun(agentRun.id, "succeeded", {
      pairCount: pairs.length,
      primaryVerdict: primary?.verdict,
      primaryCombined: primary?.combined,
      provider: provider.name,
      promptVersion: prompt.version,
    });

    return {
      runId,
      contentAssetId: input.contentAssetId,
      insightId: input.insightId,
      pairs,
      primary,
      provider: provider.name,
      promptVersion: prompt.version,
      thresholds,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await finishAgentRun(agentRun.id, "failed", undefined, msg);
    throw e;
  }
}

/** Convenience: judge two known insights (tests / CLI). */
export async function judgeInsightPair(
  insightIdA: string,
  insightIdB: string,
  opts?: { persist?: boolean; thresholds?: Partial<DedupThresholds> }
): Promise<DedupJudgeResult> {
  return judgeDuplicates({
    insightId: insightIdA,
    comparedInsightId: insightIdB,
    persist: opts?.persist,
    thresholds: opts?.thresholds,
    candidateLimit: 1,
  });
}

export const agent: Agent = {
  name: "dedup-judge",
  async run(input: AgentInput): Promise<AgentOutput> {
    try {
      const payload = input.payload as Partial<DedupJudgeInput>;
      const result = await judgeDuplicates({
        ...payload,
        runId: input.runId,
      });
      return {
        success: true,
        data: {
          runId: result.runId,
          primary: result.primary,
          pairCount: result.pairs.length,
          provider: result.provider,
        },
      };
    } catch (e) {
      return {
        success: false,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  },
};

export default agent;

// Re-export embedding helpers used by tests / pipeline
export { getEmbedding, searchSimilarInsights };
