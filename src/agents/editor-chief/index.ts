/**
 * A8 Editor-in-Chief — final ranking authority over QC/dedup-passed candidates.
 * Phase 5 Editorial: pool → ranked shortlist (best + alternates); never pad with fails.
 */

import type {
  Agent,
  AgentInput,
  AgentOutput,
  EditorScoredCandidate,
  EditorVerdict,
} from "../types";
import { prisma } from "@/db";
import type { Prisma } from "@prisma/client";
import { getActivePrompt } from "@/prompts";
import {
  allocateRunId,
  startAgentRun,
  finishAgentRun,
  appendRunLog,
} from "@/engine/runs";
import {
  DEFAULT_EDITOR_FLOOR,
  scoreEditorCandidate,
  applyPageDnaFit,
  diversifySelect,
  buildWhySelected,
  type EditorCandidateInput,
  type PageDnaSnapshot,
  type RecentMemoryItem,
} from "@/engine/ranking/editorial";
import {
  applyLearningOverlayToPool,
  type LearningOverlayContext,
} from "@/engine/ranking/learning-overlay";
import { getPreferenceWeights } from "@/engine/feedback/preferences";
import { aggregatePerformanceByGenome } from "@/analytics/performance";

export type { EditorCandidateInput, PageDnaSnapshot, RecentMemoryItem };
export { DEFAULT_EDITOR_FLOOR, scoreEditorCandidate };

export type RankPoolOpts = {
  candidates: EditorCandidateInput[];
  /** Target shortlist size (best + alternates). May return fewer. */
  target?: number;
  /** Minimum total score to be selectable. Default 70. */
  floor?: number;
  pageDna?: PageDnaSnapshot | null;
  recentMemory?: RecentMemoryItem[];
  /** How many alternates after the best (rest of shortlist). */
  alternateSlots?: number;
  /** Phase 7 preference + performance soft overlay (rankScore only). */
  learningOverlay?: LearningOverlayContext | null;
};

export type RankPoolResult = {
  poolSize: number;
  target: number;
  floor: number;
  scored: EditorScoredCandidate[];
  shortlist: EditorScoredCandidate[];
  best: EditorScoredCandidate | null;
  alternates: EditorScoredCandidate[];
  rejects: EditorScoredCandidate[];
};

/**
 * Pure ranking: score → Page DNA fit → diversify select → attach WHY / verdicts.
 * Never lowers scores to fill quota.
 */
export function rankPool(opts: RankPoolOpts): RankPoolResult {
  const target = Math.max(0, opts.target ?? 5);
  const floor = opts.floor ?? DEFAULT_EDITOR_FLOOR;
  const pageDna = opts.pageDna ?? null;
  const recentMemory = opts.recentMemory ?? [];

  let scoredRaw = opts.candidates.map((c) => {
    const base = scoreEditorCandidate(c);
    const withDna = applyPageDnaFit(base, c, pageDna);
    return withDna;
  });

  // Phase 7: soft preference / performance boosts on rankScore only
  scoredRaw = applyLearningOverlayToPool(scoredRaw, opts.learningOverlay);

  // Sort by rankScore desc for reporting
  scoredRaw.sort((a, b) => b.rankScore - a.rankScore);

  const selectable = scoredRaw.filter((s) => s.scores.total >= floor);
  const selected = diversifySelect(selectable, {
    target,
    recentMemory,
    pageDna,
  });

  const selectedIds = new Set(
    selected.map((s) => s.candidate.contentAssetId ?? s.candidate.title)
  );

  const shortlist: EditorScoredCandidate[] = selected.map((s, idx) => {
    const verdict: EditorVerdict = idx === 0 ? "best" : "alternate";
    const why = buildWhySelected(s.candidate, s.scores, {
      verdict,
      pageDna,
      recentMemory,
      selectedSoFar: selected.slice(0, idx).map((x) => x.candidate),
      rankIndex: idx,
    });
    return {
      contentAssetId: s.candidate.contentAssetId,
      title: s.candidate.title,
      format: s.candidate.format,
      scores: s.scores,
      rankScore: s.rankScore,
      passesFloor: true,
      verdict,
      WHY_THIS_WAS_SELECTED: why,
      primaryConflict: s.candidate.primaryConflict,
      visualMetaphor: s.candidate.visualMetaphor,
      endingType: s.candidate.endingType,
      hook: s.candidate.hook,
    };
  });

  const rejects: EditorScoredCandidate[] = scoredRaw
    .filter((s) => !selectedIds.has(s.candidate.contentAssetId ?? s.candidate.title))
    .map((s) => {
      const below = s.scores.total < floor;
      return {
        contentAssetId: s.candidate.contentAssetId,
        title: s.candidate.title,
        format: s.candidate.format,
        scores: s.scores,
        rankScore: s.rankScore,
        passesFloor: !below,
        verdict: "reject" as const,
        rejectReason: below
          ? `Below editor floor (${s.scores.total.toFixed(1)} < ${floor})`
          : "Not selected — outranked or conflicted with diversification of stronger picks",
        primaryConflict: s.candidate.primaryConflict,
        visualMetaphor: s.candidate.visualMetaphor,
        endingType: s.candidate.endingType,
        hook: s.candidate.hook,
      };
    });

  const allScored = [...shortlist, ...rejects].sort(
    (a, b) => b.rankScore - a.rankScore
  );

  return {
    poolSize: opts.candidates.length,
    target,
    floor,
    scored: allScored,
    shortlist,
    best: shortlist[0] ?? null,
    alternates: shortlist.slice(1),
    rejects,
  };
}

export type EditorRankInput = {
  /** Explicit asset IDs to rank; if omitted, load drafts for page. */
  contentAssetIds?: string[];
  pageSlug?: string;
  pageId?: string;
  target?: number;
  floor?: number;
  persist?: boolean;
  /** Set selected assets to reviewing (Phase 5 optional). */
  markReviewing?: boolean;
  /** Lookback for recent memory diversification. */
  recentLimit?: number;
  runId?: string;
  /** In-memory candidates (tests / dry-run). Skips DB load when provided alone. */
  candidates?: EditorCandidateInput[];
  /** Inject recent memory (tests) instead of loading from DB. */
  recentMemoryOverride?: RecentMemoryItem[];
  /** Inject learning overlay (tests) instead of loading from DB. */
  learningOverlayOverride?: LearningOverlayContext | null;
  /** Disable learning overlay load (default: load when page known). */
  useLearningOverlay?: boolean;
};

export type EditorRankResult = RankPoolResult & {
  runId: string;
  pageId?: string;
  pageSlug?: string;
  promptVersion: string;
  qualityReviewIds: string[];
};

async function loadPageDna(
  pageId?: string,
  pageSlug?: string
): Promise<{ pageId?: string; pageSlug?: string; dna: PageDnaSnapshot | null }> {
  let page =
    pageId
      ? await prisma.page.findUnique({
          where: { id: pageId },
          include: { dna: true },
        })
      : null;
  if (!page && pageSlug) {
    page = await prisma.page.findUnique({
      where: { slug: pageSlug },
      include: { dna: true },
    });
  }
  if (!page) {
    page = await prisma.page.findUnique({
      where: { slug: "the-war-within" },
      include: { dna: true },
    });
  }
  if (!page?.dna) {
    return { pageId: page?.id, pageSlug: page?.slug, dna: null };
  }
  const d = page.dna;
  return {
    pageId: page.id,
    pageSlug: page.slug,
    dna: {
      topics: d.topics as PageDnaSnapshot["topics"],
      voice: d.voice as PageDnaSnapshot["voice"],
      visualMix: d.visualMix as PageDnaSnapshot["visualMix"],
      formatMix: d.formatMix as PageDnaSnapshot["formatMix"],
      weights: d.weights as PageDnaSnapshot["weights"],
    },
  };
}

export async function assetToCandidate(
  assetId: string
): Promise<EditorCandidateInput> {
  const asset = await prisma.contentAsset.findUnique({
    where: { id: assetId },
    include: {
      genome: true,
      visualConcepts: { orderBy: { createdAt: "desc" }, take: 1 },
      concept: { include: { insight: true } },
    },
  });
  if (!asset) throw new Error(`Content asset not found: ${assetId}`);
  const meta = (asset.metadata ?? {}) as Record<string, unknown>;
  const insight = asset.concept?.insight;
  const visual = asset.visualConcepts[0];
  const vMeta = (visual?.metadata ?? {}) as Record<string, unknown>;
  return {
    contentAssetId: asset.id,
    title: asset.title,
    format: asset.format,
    body: asset.body,
    hook: typeof meta.hook === "string" ? meta.hook : asset.concept?.hook,
    caption: typeof meta.caption === "string" ? meta.caption : undefined,
    imageText: typeof meta.image_text === "string" ? meta.image_text : undefined,
    primaryConflict: asset.genome?.primaryConflict ?? insight?.primaryConflictId,
    visualMetaphor:
      asset.genome?.visualMetaphor ??
      visual?.metaphor ??
      (typeof (asset.concept?.metadata as Record<string, unknown> | null)?.metaphor ===
      "string"
        ? String((asset.concept!.metadata as Record<string, unknown>).metaphor)
        : undefined),
    endingType: asset.genome?.endingType,
    structure: asset.genome?.structure,
    lenses: Array.isArray(asset.genome?.lenses)
      ? (asset.genome!.lenses as string[])
      : undefined,
    primaryEmotion: asset.genome?.primaryEmotion,
    secondaryEmotion: asset.genome?.secondaryEmotion,
    insightStatement: insight?.statement,
    observation: insight?.observation,
    desire: insight?.desire,
    hiddenFear: insight?.hiddenFear,
    contradiction: insight?.contradictoryBehavior,
    cost: insight?.cost,
    visualUniverse:
      typeof vMeta.universe === "string"
        ? vMeta.universe
        : visual?.style ?? undefined,
    visualConcept: visual?.title,
    qualityScoreHint:
      typeof meta.quality_score === "number" ? meta.quality_score : undefined,
    metadata: meta,
  };
}

async function loadRecentMemory(
  pageId: string | undefined,
  limit: number,
  excludeIds: Set<string>
): Promise<RecentMemoryItem[]> {
  if (!pageId || limit <= 0) return [];
  const rows = await prisma.contentAsset.findMany({
    where: {
      pageId,
      status: { in: ["reviewing", "queued", "approved", "published"] },
      NOT: excludeIds.size
        ? { id: { in: [...excludeIds] } }
        : undefined,
    },
    include: { genome: true },
    orderBy: { updatedAt: "desc" },
    take: limit,
  });
  return rows.map((r) => {
    const meta = (r.metadata ?? {}) as Record<string, unknown>;
    return {
      contentAssetId: r.id,
      primaryConflict: r.genome?.primaryConflict,
      visualMetaphor: r.genome?.visualMetaphor,
      endingType: r.genome?.endingType,
      hook: typeof meta.hook === "string" ? meta.hook : undefined,
      format: r.format,
    };
  });
}

/**
 * Load pool from DB (explicit IDs or draft/reviewing assets for page),
 * rank, optionally persist quality_reviews + mark reviewing.
 */
export async function runEditorRank(
  input: EditorRankInput
): Promise<EditorRankResult> {
  const persist = input.persist !== false;
  const target = input.target ?? 5;
  const floor = input.floor ?? DEFAULT_EDITOR_FLOOR;
  const runId = input.runId ?? (await allocateRunId());

  const prompt = await getActivePrompt("editor-chief");
  const pageInfo = await loadPageDna(input.pageId, input.pageSlug);

  const agentRun = persist
    ? await startAgentRun({
        agent: "editor-chief",
        runId,
        input: {
          pageSlug: pageInfo.pageSlug,
          pageId: pageInfo.pageId,
          target,
          floor,
          contentAssetIds: input.contentAssetIds,
          candidateCount: input.candidates?.length,
        },
      })
    : null;

  try {
    let candidates: EditorCandidateInput[] = input.candidates ?? [];

    if (candidates.length === 0) {
      let ids = input.contentAssetIds;
      if (!ids || ids.length === 0) {
        if (!pageInfo.pageId) {
          throw new Error("No page found and no candidates provided");
        }
        const drafts = await prisma.contentAsset.findMany({
          where: {
            pageId: pageInfo.pageId,
            status: { in: ["draft", "reviewing"] },
          },
          orderBy: { createdAt: "desc" },
          take: 60,
          select: { id: true },
        });
        ids = drafts.map((d) => d.id);
      }
      candidates = [];
      for (const id of ids) {
        candidates.push(await assetToCandidate(id));
      }
    }

    if (agentRun) {
      await appendRunLog(agentRun.id, "info", "Ranking candidate pool", {
        poolSize: candidates.length,
        target,
        floor,
      });
    }

    const excludeIds = new Set(
      candidates.map((c) => c.contentAssetId).filter(Boolean) as string[]
    );
    const recentMemory =
      input.recentMemoryOverride ??
      (await loadRecentMemory(
        pageInfo.pageId,
        input.recentLimit ?? 30,
        excludeIds
      ));

    let learningOverlay: LearningOverlayContext | null | undefined =
      input.learningOverlayOverride;
    if (
      learningOverlay === undefined &&
      input.useLearningOverlay !== false &&
      pageInfo.pageId
    ) {
      const preferences = await getPreferenceWeights({
        pageId: pageInfo.pageId,
      });
      const performance = await aggregatePerformanceByGenome({
        pageId: pageInfo.pageId,
      });
      learningOverlay = { preferences, performance };
    }

    const ranked = rankPool({
      candidates,
      target,
      floor,
      pageDna: pageInfo.dna,
      recentMemory,
      learningOverlay,
    });

    const qualityReviewIds: string[] = [];

    if (persist) {
      for (const item of ranked.scored) {
        if (!item.contentAssetId) continue;
        const review = await prisma.qualityReview.create({
          data: {
            contentAssetId: item.contentAssetId,
            reviewer: "editor-chief",
            score: item.scores.total,
            verdict: item.verdict,
            notes:
              item.WHY_THIS_WAS_SELECTED ??
              item.rejectReason ??
              null,
            criteria: {
              scores: item.scores,
              rankScore: item.rankScore,
              passesFloor: item.passesFloor,
              WHY_THIS_WAS_SELECTED: item.WHY_THIS_WAS_SELECTED,
              rejectReason: item.rejectReason,
              promptVersion: prompt.version,
              runId,
            } as unknown as Prisma.InputJsonValue,
          },
        });
        qualityReviewIds.push(review.id);
      }

      if (input.markReviewing !== false) {
        for (const item of ranked.shortlist) {
          if (!item.contentAssetId) continue;
          await prisma.contentAsset.update({
            where: { id: item.contentAssetId },
            data: { status: "reviewing" },
          });
        }
      }

      if (agentRun) {
        await appendRunLog(agentRun.id, "info", "Shortlist ready", {
          shortlistSize: ranked.shortlist.length,
          best: ranked.best?.contentAssetId ?? ranked.best?.title,
          rejectCount: ranked.rejects.length,
        });
        await finishAgentRun(agentRun.id, "succeeded", {
          shortlist: ranked.shortlist,
          rejectCount: ranked.rejects.length,
          qualityReviewIds,
        });
      }
    }

    return {
      ...ranked,
      runId,
      pageId: pageInfo.pageId,
      pageSlug: pageInfo.pageSlug,
      promptVersion: prompt.version,
      qualityReviewIds,
    };
  } catch (e) {
    if (agentRun) {
      await finishAgentRun(
        agentRun.id,
        "failed",
        undefined,
        e instanceof Error ? e.message : String(e)
      );
    }
    throw e;
  }
}

export const agent: Agent = {
  name: "editor-chief",
  async run(input: AgentInput): Promise<AgentOutput> {
    try {
      const payload = input.payload as EditorRankInput;
      const result = await runEditorRank({
        ...payload,
        runId: input.runId,
      });
      return {
        success: true,
        data: {
          runId: result.runId,
          shortlist: result.shortlist,
          best: result.best,
          alternates: result.alternates,
          rejects: result.rejects,
          poolSize: result.poolSize,
          promptVersion: result.promptVersion,
          qualityReviewIds: result.qualityReviewIds,
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
