/**
 * Phase 9 Stage A — live vertical slice ending in Facebook DRY RUN.
 * No auto live publish. Produces preview package JSON.
 */
import fs from "fs";
import path from "path";
import { prisma } from "@/db";
import { runTodayPipeline } from "@/engine/editorial/pipeline";
import { produceImageForAsset, getLatestMediaForAsset } from "@/engine/media";
import { runVisualQc } from "@/engine/visual-qc";
import { publishContent } from "@/engine/publishing";
import { getCandidateDetail } from "@/engine/review";
import { imageProviderStatus } from "@/providers/media";
import { resolveProviderMode } from "@/providers";

export type Phase9SliceOpts = {
  pageSlug?: string;
  target?: number;
  /** Produce at least this many fully-imaged winners */
  winners?: number;
  artifactsDir?: string;
  forceFixtureImage?: boolean;
  /** Skip live publish always for Stage A */
  dryRun?: boolean;
};

export type Phase9PreviewPackage = {
  stage: "A";
  pageSlug: string;
  generatedAt: string;
  liveLlm: { available: boolean; mode: string; blocked?: string };
  liveImage: { available: boolean; mode: string; blocked?: string };
  shortlist: Array<Record<string, unknown>>;
  winner?: Record<string, unknown>;
  rejectedExamples: Array<Record<string, unknown>>;
  facebookDryRun?: Record<string, unknown>;
  artifacts: { previewJson: string; imagePath?: string };
};

export async function runPhase9VerticalSlice(
  opts: Phase9SliceOpts = {}
): Promise<Phase9PreviewPackage> {
  const pageSlug = opts.pageSlug ?? "the-war-within";
  const artifactsDir =
    opts.artifactsDir ??
    path.join(process.cwd(), "artifacts", "phase9");
  fs.mkdirSync(artifactsDir, { recursive: true });

  const llm = resolveProviderMode();
  const imgStatus = imageProviderStatus();
  const forceFixture =
    opts.forceFixtureImage === true ||
    !imgStatus.configured ||
    process.env.HNE_PROVIDER === "fixture";

  const editorial = await runTodayPipeline({
    pageSlug,
    target: opts.target ?? 5,
    minPool: Math.max(opts.target ?? 5, 3),
    produceLimit: Math.max(opts.target ?? 5, 4),
    persist: true,
    markReviewing: true,
  });

  const shortlistIds = editorial.editorial.shortlist
    .map((s) => s.contentAssetId)
    .filter((id): id is string => Boolean(id));
  const shortlist: Array<Record<string, unknown>> = [];
  const rejectedExamples: Array<Record<string, unknown>> = [];

  // Ensure each shortlisted asset has image + QC (production may already have done it)
  for (const id of shortlistIds) {
    let media = await getLatestMediaForAsset(id);
    if (!media) {
      try {
        const produced = await produceImageForAsset({
          contentAssetId: id,
          forceFixture,
          outputDir: path.join(artifactsDir, "images"),
        });
        media = produced.media;
      } catch (e) {
        rejectedExamples.push({
          contentAssetId: id,
          reason: "image_generation_failed",
          error: e instanceof Error ? e.message : String(e),
        });
        continue;
      }
    }
    const qc = await runVisualQc({
      contentAssetId: id,
      generatedMediaId: media.id,
      persist: true,
    });
    const detail = await getCandidateDetail(id);
    const pack = {
      contentAssetId: id,
      insight: detail.humanInsight,
      whyItMatters: detail.whyItMatters,
      concept: detail.concept,
      copy: {
        title: detail.title,
        caption: detail.caption,
        hook: detail.hook,
        imageText: detail.imageText,
        body: detail.body,
      },
      imagePath: media.storagePath,
      generatedMediaId: media.id,
      imagePreviewUrl: `/api/media/${media.id}`,
      visualQc: {
        verdict: qc.verdict,
        score: qc.score,
        notes: qc.notes,
        checks: qc.checks,
      },
      dedup: detail.duplicateReport,
      editor: {
        score: detail.editorScore,
        verdict: detail.verdict,
        whySelected: detail.whySelected,
        qualityScores: detail.qualityScores,
      },
      slopScore: detail.slopScore,
      readiness: detail.facebookReadiness,
      queueStatus: detail.queueStatus,
      status: detail.status,
    };
    if (qc.verdict === "PASS") shortlist.push(pack);
    else {
      rejectedExamples.push({
        ...pack,
        reason: `visual_qc_${qc.verdict}`,
      });
    }
  }

  // Capture some non-shortlist rejects / dups for the package
  const shortlistSet = new Set(shortlistIds);
  for (const c of editorial.editorial.rejects.slice(0, 8)) {
    if (rejectedExamples.length >= 6) break;
    if (c.contentAssetId && shortlistSet.has(c.contentAssetId)) continue;
    rejectedExamples.push({
      contentAssetId: c.contentAssetId,
      reason: c.rejectReason ?? "not_shortlisted",
      editorScore: c.scores?.total ?? c.rankScore,
      verdict: c.verdict,
    });
  }

  const winnersNeeded = opts.winners ?? 1;
  const winners = shortlist.slice(0, winnersNeeded);
  const winner = winners[0];

  let facebookDryRun: Record<string, unknown> | undefined;
  if (winner && typeof winner.contentAssetId === "string") {
    const outcome = await publishContent({
      contentAssetId: winner.contentAssetId,
      platform: "facebook",
      options: {
        dryRun: true,
        publishMode: "facebook_image",
        imagePath: typeof winner.imagePath === "string" ? winner.imagePath : undefined,
      },
      updateQueue: false,
      allowDuplicate: true,
    });
    facebookDryRun = {
      platform: outcome.platform,
      mode: outcome.mode,
      publishMode: outcome.publishMode,
      assetType: outcome.assetType,
      externalId: outcome.externalId,
      url: outcome.url,
      raw: outcome.raw,
      publicationRecordId: outcome.publicationRecordId,
      note: "Stage A — DRY RUN only; no live Facebook publish",
    };
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const previewPath = path.join(artifactsDir, `preview-${pageSlug}-${stamp}.json`);
  let copiedImage: string | undefined;
  if (winner && typeof winner.imagePath === "string" && fs.existsSync(winner.imagePath)) {
    copiedImage = path.join(artifactsDir, `winner-${stamp}.png`);
    fs.copyFileSync(winner.imagePath, copiedImage);
  }

  const preview: Phase9PreviewPackage = {
    stage: "A",
    pageSlug,
    generatedAt: new Date().toISOString(),
    liveLlm: {
      available: llm.mode === "live",
      mode: llm.name,
      blocked:
        llm.mode === "fixture"
          ? "LIVE_LLM blocked — no OPENAI_API_KEY/XAI_API_KEY or HNE_PROVIDER=fixture"
          : undefined,
    },
    liveImage: {
      available: imgStatus.configured && imgStatus.mode === "live" && !forceFixture,
      mode: forceFixture ? "fixture" : imgStatus.mode,
      blocked: forceFixture
        ? "LIVE_IMAGE blocked — using fixture PNG writer (OPENAI_API_KEY absent or forced fixture)"
        : undefined,
    },
    shortlist,
    winner,
    rejectedExamples,
    facebookDryRun,
    artifacts: {
      previewJson: previewPath,
      imagePath: copiedImage,
    },
  };

  // Strip any accidental secrets before write
  const json = JSON.stringify(preview, null, 2);
  if (/sk-[A-Za-z0-9]{10,}/.test(json) || /EAA[A-Za-z0-9]{10,}/.test(json)) {
    throw new Error("Refusing to write preview — possible secret leakage");
  }
  fs.writeFileSync(previewPath, json);
  // Also write stable latest pointer
  fs.writeFileSync(
    path.join(artifactsDir, "preview-latest.json"),
    json
  );

  return preview;
}
