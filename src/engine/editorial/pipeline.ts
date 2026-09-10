/**
 * Phase 5 daily editorial pipeline:
 * pool (existing QC/dedup-passed drafts, or produce more) → Editor ranks → shortlist.
 * Human approval / queueing is Phase 6 — here we only rank + persist reviews (+ reviewing).
 */

import { prisma } from "@/db";
import {
  runEditorRank,
  type EditorRankResult,
  type EditorRankInput,
} from "@/agents/editor-chief";
import { runProductionPipeline } from "@/engine/production/pipeline";
import { seedPhase5Prompts } from "@/prompts";
import {
  allocateRunId,
  startAgentRun,
  finishAgentRun,
  appendRunLog,
} from "@/engine/runs";
import { DEFAULT_EDITOR_FLOOR } from "@/engine/ranking/editorial";

export type TodayPipelineOpts = {
  pageSlug?: string;
  pageId?: string;
  /** Desired shortlist size. */
  target?: number;
  floor?: number;
  /** If draft pool is smaller than this, produce more from approved insights. */
  minPool?: number;
  /** Cap on newly produced assets this run. */
  produceLimit?: number;
  persist?: boolean;
  markReviewing?: boolean;
  runId?: string;
  /** Explicit asset IDs — skip auto pool discovery. */
  contentAssetIds?: string[];
};

export type TodayPipelineResult = {
  runId: string;
  pageSlug?: string;
  pageId?: string;
  poolSize: number;
  produced: number;
  editorial: EditorRankResult;
};

async function resolvePage(pageId?: string, pageSlug?: string) {
  let page = pageId
    ? await prisma.page.findUnique({ where: { id: pageId } })
    : null;
  if (!page) {
    page = await prisma.page.findUnique({
      where: { slug: pageSlug ?? "the-war-within" },
    });
  }
  if (!page) throw new Error("Page not found");
  return page;
}

async function loadEligibleDrafts(pageId: string, limit: number) {
  // Prefer drafts that have genomes (produced) and are not hard-rejected by dedup
  const assets = await prisma.contentAsset.findMany({
    where: {
      pageId,
      status: { in: ["draft", "reviewing"] },
      genome: { isNot: null },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      duplicateChecks: { orderBy: { createdAt: "desc" }, take: 3 },
    },
  });

  return assets.filter((a) => {
    const hard = a.duplicateChecks.some((d) => d.verdict === "hard_duplicate");
    return !hard;
  });
}

async function expandPool(
  page: { id: string; slug: string },
  need: number,
  runId: string
): Promise<string[]> {
  if (need <= 0) return [];
  const insights = await prisma.humanInsight.findMany({
    where: { status: { in: ["approved", "used"] } },
    orderBy: { createdAt: "desc" },
    take: Math.max(need * 2, 8),
  });

  const created: string[] = [];
  for (const insight of insights) {
    if (created.length >= need) break;
    try {
      // Nested agents allocate their own run ids (agent_runs.run_id is unique).
      const produced = await runProductionPipeline({
        insightId: insight.id,
        pageSlug: page.slug,
        persist: true,
        dedup: true,
        conceptCount: 2,
      });
      if (produced.contentAssetId) created.push(produced.contentAssetId);
    } catch {
      // skip failing productions; editor must not invent content without insights
      continue;
    }
  }
  return created;
}

/**
 * Daily selection: gather/produce pool → Editor-in-Chief ranks → shortlist only.
 */
export async function runTodayPipeline(
  opts: TodayPipelineOpts = {}
): Promise<TodayPipelineResult> {
  await seedPhase5Prompts();

  const persist = opts.persist !== false;
  const target = opts.target ?? 5;
  const minPool = opts.minPool ?? Math.max(target * 2, 8);
  const produceLimit = opts.produceLimit ?? 12;
  const floor = opts.floor ?? DEFAULT_EDITOR_FLOOR;
  const runId = opts.runId ?? (await allocateRunId());

  const page = await resolvePage(opts.pageId, opts.pageSlug);

  const pipelineRun = persist
    ? await startAgentRun({
        agent: "editorial-pipeline",
        runId,
        input: {
          pageSlug: page.slug,
          target,
          minPool,
          floor,
        },
      })
    : null;

  try {
    let assetIds = opts.contentAssetIds ? [...opts.contentAssetIds] : [];
    let produced = 0;

    if (assetIds.length === 0) {
      const drafts = await loadEligibleDrafts(page.id, 60);
      assetIds = drafts.map((d) => d.id);
    }

    if (assetIds.length < minPool && persist) {
      const need = Math.min(produceLimit, minPool - assetIds.length);
      if (pipelineRun) {
        await appendRunLog(
          pipelineRun.id,
          "info",
          `Expanding pool: have ${assetIds.length}, need ${need} more`,
          { minPool }
        );
      }
      const created = await expandPool(page, need, runId);
      produced = created.length;
      assetIds = [...assetIds, ...created];
    }

    if (pipelineRun) {
      await appendRunLog(pipelineRun.id, "info", "Handing pool to Editor-in-Chief", {
        poolSize: assetIds.length,
      });
    }

    const editorial = await runEditorRank({
      contentAssetIds: assetIds,
      pageId: page.id,
      pageSlug: page.slug,
      target,
      floor,
      persist,
      markReviewing: opts.markReviewing !== false,
      // Do not reuse parent runId — unique constraint on agent_runs.run_id
    } satisfies EditorRankInput);

    if (pipelineRun) {
      await finishAgentRun(pipelineRun.id, "succeeded", {
        poolSize: assetIds.length,
        produced,
        shortlistSize: editorial.shortlist.length,
        bestId: editorial.best?.contentAssetId,
      });
    }

    return {
      runId,
      pageSlug: page.slug,
      pageId: page.id,
      poolSize: assetIds.length,
      produced,
      editorial,
    };
  } catch (e) {
    if (pipelineRun) {
      await finishAgentRun(
        pipelineRun.id,
        "failed",
        undefined,
        e instanceof Error ? e.message : String(e)
      );
    }
    throw e;
  }
}
