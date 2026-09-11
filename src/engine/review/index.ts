/**
 * Phase 6 human review workflow (+ Phase 7 learning):
 * approve → content_queue + feedback; reject/edit/favorite/regenerate → feedback_events.
 * Feedback events also update preference_weights (never Page DNA).
 */

import { prisma } from "@/db";
import { recordFeedback } from "@/engine/feedback";
import { runProductionPipeline } from "@/engine/production/pipeline";
import { directVisual } from "@/agents/visual-director";
import { produceImageForAsset } from "@/engine/media";
import { runVisualQc } from "@/engine/visual-qc";
import type { FeedbackAction, Prisma } from "@prisma/client";

function asJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

export const ASSET_STATUSES = [
  "draft",
  "reviewing",
  "rejected",
  "approved",
  "queued",
  "published",
  "archived",
] as const;

export type AssetStatus = (typeof ASSET_STATUSES)[number];

export const QUEUE_STATUSES = ASSET_STATUSES;

export type CandidateCard = {
  id: string;
  title: string;
  status: string;
  format: string;
  score: number | null;
  verdict: string | null;
  whySelected: string | null;
  page: { id: string; slug: string; name: string } | null;
  seriesOrType: string;
  primaryConflict: string | null;
  imageText: string | null;
  caption: string | null;
  hook: string | null;
  body: string | null;
  visualPreview: {
    title: string | null;
    metaphor: string | null;
    style: string | null;
    placeholder: boolean;
    imageUrl: string | null;
    generatedMediaId: string | null;
    qcStatus: string | null;
    qcVerdict: string | null;
  };
  humanInsightSummary: string | null;
  whyItMatters: string | null;
  facebookReadiness: {
    ready: boolean;
    reasons: string[];
    publishMode: string;
  };
  queueStatus: string | null;
  slopScore: number | null;
  editorScore: number | null;
  visualQcScore: number | null;
  similarityWarning: string | null;
  insightId: string | null;
};

export type CandidateDetail = CandidateCard & {
  humanInsight: {
    id: string;
    statement: string;
    observation: string | null;
    desire: string | null;
    hiddenFear: string | null;
    contradictoryBehavior: string | null;
    cost: string | null;
    primaryConflictId: string | null;
    status: string;
  } | null;
  concept: {
    id: string;
    title: string;
    angle: string | null;
    hook: string | null;
    thesis: string | null;
  } | null;
  genome: Record<string, unknown> | null;
  visualConcept: {
    id: string;
    title: string;
    metaphor: string | null;
    style: string | null;
    composition: string | null;
    generationPrompt: string | null;
    rationale: string | null;
  } | null;
  qualityScores: Record<string, unknown> | null;
  duplicateReport: {
    verdict: string;
    similarity: number | null;
    textSimilarity: number | null;
    insightSimilarity: number | null;
    genomeSimilarity: number | null;
    visualSimilarity: number | null;
    notes: string | null;
  } | null;
  whySelected: string | null;
  advanced: {
    metadata: Record<string, unknown>;
    qualityReviews: Array<{
      id: string;
      reviewer: string;
      score: number | null;
      verdict: string;
      notes: string | null;
      criteria: unknown;
      createdAt: string;
    }>;
    duplicateChecks: Array<{
      id: string;
      verdict: string;
      similarity: number | null;
      notes: string | null;
      createdAt: string;
    }>;
  };
};

function metaString(
  meta: Record<string, unknown>,
  key: string
): string | null {
  const v = meta[key];
  return typeof v === "string" ? v : null;
}

function similarityWarningFromChecks(
  checks: Array<{
    verdict: string;
    similarity: number | null;
    textSimilarity: number | null;
    notes: string | null;
  }>
): string | null {
  const latest = checks[0];
  if (!latest) return null;
  if (latest.verdict === "hard_duplicate") {
    return `Hard duplicate risk${latest.similarity != null ? ` (${(latest.similarity * 100).toFixed(0)}%)` : ""}${latest.notes ? `: ${latest.notes}` : ""}`;
  }
  if (latest.verdict === "rewrite_recommended" || latest.verdict === "near_duplicate") {
    return `Similarity warning (${latest.verdict})${latest.similarity != null ? ` ${(latest.similarity * 100).toFixed(0)}%` : ""}`;
  }
  const sim = latest.similarity ?? latest.textSimilarity;
  if (sim != null && sim >= 0.78) {
    return `Elevated similarity ${(sim * 100).toFixed(0)}% — review before approve`;
  }
  return null;
}

export async function listPages() {
  return prisma.page.findMany({
    include: { dna: true },
    orderBy: { name: "asc" },
  });
}

export async function getPageBySlug(slug: string) {
  return prisma.page.findUnique({
    where: { slug },
    include: { dna: true },
  });
}

export async function updatePageDna(
  slug: string,
  dna: {
    topics?: unknown;
    voice?: unknown;
    visualMix?: unknown;
    formatMix?: unknown;
    weights?: unknown;
  }
) {
  const page = await prisma.page.findUnique({ where: { slug } });
  if (!page) throw new Error(`Page not found: ${slug}`);
  return prisma.pageDna.upsert({
    where: { pageId: page.id },
    create: {
      pageId: page.id,
      topics: (dna.topics as object) ?? {},
      voice: (dna.voice as object) ?? {},
      visualMix: (dna.visualMix as object) ?? {},
      formatMix: (dna.formatMix as object) ?? {},
      weights: (dna.weights as object) ?? undefined,
    },
    update: {
      ...(dna.topics !== undefined ? { topics: dna.topics as object } : {}),
      ...(dna.voice !== undefined ? { voice: dna.voice as object } : {}),
      ...(dna.visualMix !== undefined
        ? { visualMix: dna.visualMix as object }
        : {}),
      ...(dna.formatMix !== undefined
        ? { formatMix: dna.formatMix as object }
        : {}),
      ...(dna.weights !== undefined ? { weights: dna.weights as object } : {}),
    },
  });
}

async function loadAssetBundle(id: string) {
  const asset = await prisma.contentAsset.findUnique({
    where: { id },
    include: {
      page: true,
      genome: true,
      visualConcepts: { orderBy: { createdAt: "desc" }, take: 1 },
      qualityReviews: { orderBy: { createdAt: "desc" }, take: 5 },
      duplicateChecks: { orderBy: { createdAt: "desc" }, take: 5 },
      concept: { include: { insight: true } },
      generatedMedia: { orderBy: { createdAt: "desc" }, take: 1 },
      contentQueue: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
  if (!asset) throw new Error(`Content asset not found: ${id}`);
  return asset;
}

function toCard(
  asset: Awaited<ReturnType<typeof loadAssetBundle>>
): CandidateCard {
  const meta = (asset.metadata ?? {}) as Record<string, unknown>;
  const editorReview = asset.qualityReviews.find(
    (r) => r.reviewer === "editor-chief"
  );
  const criteria = (editorReview?.criteria ?? {}) as Record<string, unknown>;
  const why =
    (typeof criteria.WHY_THIS_WAS_SELECTED === "string"
      ? criteria.WHY_THIS_WAS_SELECTED
      : null) ??
    editorReview?.notes ??
    null;
  const visual = asset.visualConcepts[0];
  const vMeta = (visual?.metadata ?? {}) as Record<string, unknown>;

  return {
    id: asset.id,
    title: asset.title,
    status: asset.status,
    format: asset.format,
    score: editorReview?.score ?? null,
    verdict: editorReview?.verdict ?? null,
    whySelected: why,
    page: asset.page
      ? { id: asset.page.id, slug: asset.page.slug, name: asset.page.name }
      : null,
    seriesOrType: asset.format,
    primaryConflict:
      asset.genome?.primaryConflict ??
      asset.concept?.insight?.primaryConflictId ??
      null,
    imageText: metaString(meta, "image_text"),
    caption: metaString(meta, "caption"),
    hook: metaString(meta, "hook") ?? asset.concept?.hook ?? null,
    body: asset.body,
    visualPreview: (() => {
      const media = (asset as { generatedMedia?: Array<{ id: string; qcStatus: string }> }).generatedMedia?.[0];
      const imageUrl = media ? `/api/media/${media.id}` : null;
      const vqc = asset.qualityReviews.find((r) => r.reviewer === "visual-qc");
      return {
        title: visual?.title ?? null,
        metaphor: visual?.metaphor ?? null,
        style: visual?.style ?? (typeof vMeta.universe === "string" ? vMeta.universe : null),
        placeholder: !imageUrl,
        imageUrl,
        generatedMediaId: media?.id ?? null,
        qcStatus: media?.qcStatus ?? null,
        qcVerdict: vqc?.verdict ?? null,
      };
    })(),
    similarityWarning: similarityWarningFromChecks(asset.duplicateChecks),
    insightId: asset.concept?.insightId ?? null,
    humanInsightSummary: asset.concept?.insight?.statement ?? null,
    whyItMatters:
      asset.concept?.insight?.cost ??
      asset.concept?.insight?.observation ??
      null,
    facebookReadiness: (() => {
      const media = (asset as { generatedMedia?: Array<{ id: string; qcStatus: string; storagePath: string }> }).generatedMedia?.[0];
      const vqc = asset.qualityReviews.find((r) => r.reviewer === "visual-qc");
      const reasons: string[] = [];
      if (!media) reasons.push("missing generated image");
      else if (media.qcStatus !== "pass" && vqc?.verdict !== "PASS") {
        reasons.push(`visual QC not PASS (${media.qcStatus}/${vqc?.verdict ?? "n/a"})`);
      }
      const hard = asset.duplicateChecks.some((d) => d.verdict === "hard_duplicate");
      if (hard) reasons.push("hard duplicate");
      if (!metaString((asset.metadata ?? {}) as Record<string, unknown>, "caption") && !asset.body) {
        reasons.push("missing caption/body");
      }
      return {
        ready: reasons.length === 0 && Boolean(media),
        reasons,
        publishMode: media ? "facebook_image" : "facebook_text",
      };
    })(),
    queueStatus:
      (asset as { contentQueue?: Array<{ status: string }> }).contentQueue?.[0]?.status ??
      (asset.status === "queued" || asset.status === "published" ? asset.status : null),
    slopScore: (() => {
      const slop = asset.qualityReviews.find((r) => r.reviewer === "slop-critic");
      return slop?.score ?? null;
    })(),
    editorScore: editorReview?.score ?? null,
    visualQcScore: (() => {
      const vqc = asset.qualityReviews.find((r) => r.reviewer === "visual-qc");
      return vqc?.score ?? null;
    })(),
  };
}

export async function listCandidates(opts: {
  status?: string | string[];
  pageSlug?: string;
  limit?: number;
} = {}): Promise<CandidateCard[]> {
  const statuses = opts.status
    ? Array.isArray(opts.status)
      ? opts.status
      : [opts.status]
    : ["reviewing"];

  let pageId: string | undefined;
  if (opts.pageSlug) {
    const page = await prisma.page.findUnique({
      where: { slug: opts.pageSlug },
    });
    pageId = page?.id;
  }

  const assets = await prisma.contentAsset.findMany({
    where: {
      status: { in: statuses },
      ...(pageId ? { pageId } : {}),
    },
    orderBy: { updatedAt: "desc" },
    take: opts.limit ?? 50,
    include: {
      page: true,
      genome: true,
      visualConcepts: { orderBy: { createdAt: "desc" }, take: 1 },
      qualityReviews: { orderBy: { createdAt: "desc" }, take: 5 },
      duplicateChecks: { orderBy: { createdAt: "desc" }, take: 5 },
      concept: { include: { insight: true } },
      generatedMedia: { orderBy: { createdAt: "desc" }, take: 1 },
      contentQueue: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });

  return assets.map(toCard);
}

export async function getCandidateDetail(id: string): Promise<CandidateDetail> {
  const asset = await loadAssetBundle(id);
  const card = toCard(asset);
  const meta = (asset.metadata ?? {}) as Record<string, unknown>;
  const editorReview = asset.qualityReviews.find(
    (r) => r.reviewer === "editor-chief"
  );
  const criteria = (editorReview?.criteria ?? {}) as Record<string, unknown>;
  const visual = asset.visualConcepts[0];
  const vMeta = (visual?.metadata ?? {}) as Record<string, unknown>;
  const dup = asset.duplicateChecks[0];

  return {
    ...card,
    humanInsight: asset.concept?.insight
      ? {
          id: asset.concept.insight.id,
          statement: asset.concept.insight.statement,
          observation: asset.concept.insight.observation,
          desire: asset.concept.insight.desire,
          hiddenFear: asset.concept.insight.hiddenFear,
          contradictoryBehavior: asset.concept.insight.contradictoryBehavior,
          cost: asset.concept.insight.cost,
          primaryConflictId: asset.concept.insight.primaryConflictId,
          status: asset.concept.insight.status,
        }
      : null,
    concept: asset.concept
      ? {
          id: asset.concept.id,
          title: asset.concept.title,
          angle: asset.concept.angle,
          hook: asset.concept.hook,
          thesis: asset.concept.thesis,
        }
      : null,
    genome: asset.genome
      ? {
          primaryConflict: asset.genome.primaryConflict,
          secondaryConflicts: asset.genome.secondaryConflicts,
          primaryEmotion: asset.genome.primaryEmotion,
          secondaryEmotion: asset.genome.secondaryEmotion,
          lenses: asset.genome.lenses,
          tones: asset.genome.tones,
          depthLevel: asset.genome.depthLevel,
          structure: asset.genome.structure,
          visualMetaphor: asset.genome.visualMetaphor,
          endingType: asset.genome.endingType,
          audienceWounds: asset.genome.audienceWounds,
        }
      : null,
    visualConcept: visual
      ? {
          id: visual.id,
          title: visual.title,
          metaphor: visual.metaphor,
          style: visual.style,
          composition: visual.composition,
          generationPrompt:
            typeof vMeta.generation_prompt === "string"
              ? vMeta.generation_prompt
              : typeof vMeta.generationPrompt === "string"
                ? vMeta.generationPrompt
                : null,
          rationale:
            typeof vMeta.visual_rationale === "string"
              ? vMeta.visual_rationale
              : typeof vMeta.rationale === "string"
                ? vMeta.rationale
                : null,
        }
      : null,
    qualityScores:
      (criteria.scores as Record<string, unknown> | undefined) ??
      (editorReview?.score != null
        ? { total: editorReview.score, verdict: editorReview.verdict }
        : null),
    duplicateReport: dup
      ? {
          verdict: dup.verdict,
          similarity: dup.similarity,
          textSimilarity: dup.textSimilarity,
          insightSimilarity: dup.insightSimilarity,
          genomeSimilarity: dup.genomeSimilarity,
          visualSimilarity: dup.visualSimilarity,
          notes: dup.notes,
        }
      : null,
    whySelected: card.whySelected,
    advanced: {
      metadata: meta,
      qualityReviews: asset.qualityReviews.map((r) => ({
        id: r.id,
        reviewer: r.reviewer,
        score: r.score,
        verdict: r.verdict,
        notes: r.notes,
        criteria: r.criteria,
        createdAt: r.createdAt.toISOString(),
      })),
      duplicateChecks: asset.duplicateChecks.map((d) => ({
        id: d.id,
        verdict: d.verdict,
        similarity: d.similarity,
        notes: d.notes,
        createdAt: d.createdAt.toISOString(),
      })),
    },
  };
}

export type ReviewAction =
  | "approve"
  | "reject"
  | "edit"
  | "favorite"
  | "regenerate"
  | "regenerate_visual"
  | "save_for_later"
  | "copy";

export type ReviewActionInput = {
  contentAssetId: string;
  action: ReviewAction;
  reason?: string;
  notes?: string;
  /** Partial field updates for edit */
  edits?: {
    title?: string;
    body?: string;
    caption?: string;
    imageText?: string;
    hook?: string;
    status?: string;
  };
};

export type ReviewActionResult = {
  ok: true;
  action: ReviewAction;
  contentAssetId: string;
  feedbackEventId?: string;
  queueItemId?: string;
  assetStatus: string;
  regeneratedAssetId?: string;
  detail?: CandidateDetail;
};

async function nextQueuePosition(pageId: string | null): Promise<number> {
  const agg = await prisma.contentQueue.aggregate({
    where: pageId ? { pageId } : undefined,
    _max: { position: true },
  });
  return (agg._max.position ?? 0) + 1;
}

export async function applyReviewAction(
  input: ReviewActionInput
): Promise<ReviewActionResult> {
  const asset = await prisma.contentAsset.findUnique({
    where: { id: input.contentAssetId },
    include: { concept: true },
  });
  if (!asset) throw new Error(`Content asset not found: ${input.contentAssetId}`);

  const insightId = asset.concept?.insightId;

  const mapFeedback = (action: ReviewAction): FeedbackAction | null => {
    switch (action) {
      case "approve":
        return "approve";
      case "reject":
        return "reject";
      case "edit":
        return "edit";
      case "favorite":
        return "favorite";
      case "regenerate":
      case "regenerate_visual":
        return "regenerate";
      case "save_for_later":
      case "copy":
        return null;
      default:
        return null;
    }
  };

  const fbAction = mapFeedback(input.action);
  let feedbackEventId: string | undefined;
  const prevMeta = (asset.metadata ?? {}) as Record<string, unknown>;
  const previousCaption =
    typeof prevMeta.caption === "string" ? prevMeta.caption : null;
  if (fbAction) {
    const fb = await recordFeedback({
      objectType: "content_asset",
      objectId: asset.id,
      action: fbAction,
      reason: input.reason,
      notes: input.notes ?? `phase6:${input.action}`,
      insightId: insightId ?? undefined,
      pageId: asset.pageId ?? undefined,
      previousCaption,
      newCaption:
        input.action === "edit" && input.edits?.caption !== undefined
          ? input.edits.caption
          : previousCaption,
    });
    feedbackEventId = fb.id;
  }

  let queueItemId: string | undefined;
  let regeneratedAssetId: string | undefined;
  let assetStatus = asset.status;

  switch (input.action) {
    case "approve": {
      // Phase 9: if generated media exists, require Visual QC PASS before queue
      const latestMedia = await prisma.generatedMedia.findFirst({
        where: { contentAssetId: asset.id },
        orderBy: { createdAt: "desc" },
      });
      if (latestMedia) {
        const vqc = await prisma.qualityReview.findFirst({
          where: { contentAssetId: asset.id, reviewer: "visual-qc" },
          orderBy: { createdAt: "desc" },
        });
        const pass =
          latestMedia.qcStatus === "pass" || vqc?.verdict === "PASS";
        if (!pass) {
          throw new Error(
            `Cannot queue: visual QC is ${latestMedia.qcStatus}${vqc ? `/${vqc.verdict}` : ""} (need PASS)`
          );
        }
      }
      const position = await nextQueuePosition(asset.pageId);
      const queueItem = await prisma.contentQueue.create({
        data: {
          contentAssetId: asset.id,
          pageId: asset.pageId,
          position,
          status: "queued",
        },
      });
      queueItemId = queueItem.id;
      await prisma.contentAsset.update({
        where: { id: asset.id },
        data: { status: "queued" },
      });
      assetStatus = "queued";
      if (insightId) {
        const insight = await prisma.humanInsight.findUnique({
          where: { id: insightId },
        });
        if (insight && insight.status === "approved") {
          await prisma.humanInsight.update({
            where: { id: insightId },
            data: { status: "used" },
          });
        }
      }
      break;
    }
    case "reject": {
      await prisma.contentAsset.update({
        where: { id: asset.id },
        data: { status: "rejected" },
      });
      assetStatus = "rejected";
      break;
    }
    case "edit": {
      const meta = {
        ...((asset.metadata ?? {}) as Record<string, unknown>),
      };
      if (input.edits?.caption !== undefined) meta.caption = input.edits.caption;
      if (input.edits?.imageText !== undefined)
        meta.image_text = input.edits.imageText;
      if (input.edits?.hook !== undefined) meta.hook = input.edits.hook;
      await prisma.contentAsset.update({
        where: { id: asset.id },
        data: {
          title: input.edits?.title ?? asset.title,
          body: input.edits?.body ?? asset.body,
          metadata: asJson(meta),
          status: input.edits?.status ?? asset.status,
        },
      });
      assetStatus = input.edits?.status ?? asset.status;
      break;
    }
    case "favorite": {
      const meta = {
        ...((asset.metadata ?? {}) as Record<string, unknown>),
        favorited: true,
        favoritedAt: new Date().toISOString(),
      };
      await prisma.contentAsset.update({
        where: { id: asset.id },
        data: { metadata: asJson(meta) },
      });
      break;
    }
    case "save_for_later": {
      const meta = {
        ...((asset.metadata ?? {}) as Record<string, unknown>),
        savedForLater: true,
        savedForLaterAt: new Date().toISOString(),
      };
      await prisma.contentAsset.update({
        where: { id: asset.id },
        data: {
          status: "draft",
          metadata: asJson(meta),
        },
      });
      assetStatus = "draft";
      // Lightweight feedback trail without inventing a FeedbackAction enum value
      const fb = await recordFeedback({
        objectType: "content_asset",
        objectId: asset.id,
        action: "edit",
        reason: input.reason ?? "save_for_later",
        notes: input.notes ?? "Saved for later from Phase 6 UI",
        insightId: insightId ?? undefined,
      });
      feedbackEventId = fb.id;
      break;
    }
    case "copy": {
      // No mutation — UI copies text; optional note trail
      break;
    }
    case "regenerate": {
      if (!insightId) {
        throw new Error("Cannot regenerate without parent insight");
      }
      const page = asset.pageId
        ? await prisma.page.findUnique({ where: { id: asset.pageId } })
        : null;
      const produced = await runProductionPipeline({
        insightId,
        pageSlug: page?.slug ?? "the-war-within",
        persist: true,
        dedup: true,
        conceptCount: 1,
      });
      regeneratedAssetId = produced.contentAssetId ?? undefined;
      if (regeneratedAssetId) {
        await prisma.contentAsset.update({
          where: { id: regeneratedAssetId },
          data: { status: "reviewing" },
        });
      }
      await prisma.contentAsset.update({
        where: { id: asset.id },
        data: {
          metadata: asJson({
            ...((asset.metadata ?? {}) as Record<string, unknown>),
            regeneratedInto: regeneratedAssetId,
          }),
        },
      });
      break;
    }
    case "regenerate_visual": {
      const visual = await directVisual({
        contentAssetId: asset.id,
        persist: true,
      });
      if (visual.visualConceptId) {
        try {
          const img = await produceImageForAsset({
            contentAssetId: asset.id,
            visualConceptId: visual.visualConceptId,
          });
          await runVisualQc({
            contentAssetId: asset.id,
            generatedMediaId: img.media.id,
            persist: true,
          });
        } catch {
          // keep visual brief; image failure surfaces via readiness
        }
      }
      break;
    }
  }

  const detail = await getCandidateDetail(
    regeneratedAssetId ?? asset.id
  ).catch(() => undefined);

  return {
    ok: true,
    action: input.action,
    contentAssetId: asset.id,
    feedbackEventId,
    queueItemId,
    assetStatus: detail?.status ?? assetStatus,
    regeneratedAssetId,
    detail,
  };
}

export async function listQueue(opts: {
  status?: string;
  pageSlug?: string;
  limit?: number;
} = {}) {
  let pageId: string | undefined;
  if (opts.pageSlug) {
    const page = await prisma.page.findUnique({
      where: { slug: opts.pageSlug },
    });
    pageId = page?.id;
  }

  return prisma.contentQueue.findMany({
    where: {
      ...(opts.status ? { status: opts.status } : {}),
      ...(pageId ? { pageId } : {}),
    },
    orderBy: [{ position: "asc" }, { createdAt: "desc" }],
    take: opts.limit ?? 100,
    include: {
      page: true,
      contentAsset: {
        include: {
          genome: true,
          concept: { include: { insight: true } },
        },
      },
    },
  });
}

/** Shape returned by generate-today for UI + tests */
export type GenerateTodayResponse = {
  runId: string;
  pageSlug?: string;
  pageId?: string;
  poolSize: number;
  produced: number;
  shortlist: Array<{
    contentAssetId?: string;
    title: string;
    format: string;
    rankScore: number;
    scores: { total: number };
    verdict: string;
    WHY_THIS_WAS_SELECTED?: string;
    primaryConflict?: string | null;
  }>;
  best: {
    contentAssetId?: string;
    title: string;
    rankScore: number;
    WHY_THIS_WAS_SELECTED?: string;
  } | null;
  alternates: Array<{ contentAssetId?: string; title: string; rankScore: number }>;
  rejects: Array<{ contentAssetId?: string; title: string; rankScore: number }>;
  candidates: CandidateCard[];
};

export function shapeTodayResult(
  result: {
    runId: string;
    pageSlug?: string;
    pageId?: string;
    poolSize: number;
    produced: number;
    editorial: {
      shortlist: Array<{
        contentAssetId?: string;
        title: string;
        format: string;
        rankScore: number;
        scores: { total: number };
        verdict: string;
        WHY_THIS_WAS_SELECTED?: string;
        primaryConflict?: string | null;
      }>;
      best: {
        contentAssetId?: string;
        title: string;
        rankScore: number;
        WHY_THIS_WAS_SELECTED?: string;
      } | null;
      alternates: Array<{
        contentAssetId?: string;
        title: string;
        rankScore: number;
      }>;
      rejects: Array<{
        contentAssetId?: string;
        title: string;
        rankScore: number;
      }>;
    };
  },
  candidates: CandidateCard[]
): GenerateTodayResponse {
  return {
    runId: result.runId,
    pageSlug: result.pageSlug,
    pageId: result.pageId,
    poolSize: result.poolSize,
    produced: result.produced,
    shortlist: result.editorial.shortlist,
    best: result.editorial.best,
    alternates: result.editorial.alternates,
    rejects: result.editorial.rejects,
    candidates,
  };
}
