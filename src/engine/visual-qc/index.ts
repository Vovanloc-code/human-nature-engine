/**
 * Phase 9 Visual QC gate — PASS | REGENERATE | REJECT.
 * Queue only PASS. Heuristic, deterministic, no secrets.
 */
import fs from "fs";
import { prisma } from "@/db";
import { isReadableImageFile } from "@/providers/media";
import { OVERUSED_MOTIFS } from "@/agents/visual-director";
import type { Prisma } from "@prisma/client";

export type VisualQcVerdict = "PASS" | "REGENERATE" | "REJECT";

export type VisualQcCheck = {
  id: string;
  ok: boolean;
  severity: "info" | "warn" | "fail";
  message: string;
};

export type VisualQcResult = {
  verdict: VisualQcVerdict;
  checks: VisualQcCheck[];
  score: number;
  notes: string;
  mediaId?: string;
  contentAssetId?: string;
};

export type RunVisualQcOpts = {
  contentAssetId?: string;
  generatedMediaId?: string;
  /** Persist qcStatus onto GeneratedMedia + quality_reviews */
  persist?: boolean;
  /** Recent motif history override for tests */
  recentMotifs?: string[];
};

function aspectOf(w?: number | null, h?: number | null): number | null {
  if (!w || !h || w <= 0 || h <= 0) return null;
  return w / h;
}

function expectedAspect(format?: string | null): { min: number; max: number } {
  // Facebook feed / square-ish default
  if (format === "story" || format === "reel") return { min: 0.5, max: 0.65 };
  return { min: 0.7, max: 1.4 }; // allow 4:5 through 1:1ish
}

export async function runVisualQc(opts: RunVisualQcOpts): Promise<VisualQcResult> {
  const checks: VisualQcCheck[] = [];
  let media = opts.generatedMediaId
    ? await prisma.generatedMedia.findUnique({ where: { id: opts.generatedMediaId } })
    : null;

  if (!media && opts.contentAssetId) {
    media = await prisma.generatedMedia.findFirst({
      where: { contentAssetId: opts.contentAssetId },
      orderBy: { createdAt: "desc" },
    });
  }

  const contentAssetId = opts.contentAssetId ?? media?.contentAssetId ?? undefined;
  const asset = contentAssetId
    ? await prisma.contentAsset.findUnique({
        where: { id: contentAssetId },
        include: {
          genome: true,
          visualConcepts: { orderBy: { createdAt: "desc" }, take: 1 },
          page: { include: { dna: true } },
          concept: { include: { insight: true } },
          duplicateChecks: { orderBy: { createdAt: "desc" }, take: 3 },
        },
      })
    : null;

  // 1. Media exists
  if (!media) {
    checks.push({
      id: "media_present",
      ok: false,
      severity: "fail",
      message: "No generated media attached — image generation missing",
    });
    return finalize("REJECT", checks, { contentAssetId, persist: opts.persist });
  }

  checks.push({
    id: "media_present",
    ok: true,
    severity: "info",
    message: `Media ${media.id} present`,
  });

  // 2. File exists readable
  const readable = isReadableImageFile(media.storagePath);
  checks.push({
    id: "file_readable",
    ok: readable,
    severity: readable ? "info" : "fail",
    message: readable
      ? `Readable file at ${media.storagePath}`
      : `Missing/unreadable file: ${media.storagePath}`,
  });
  if (!readable) {
    return finalize("REJECT", checks, {
      contentAssetId,
      mediaId: media.id,
      persist: opts.persist,
    });
  }

  // 3. No placeholder / stub
  const meta = (media.metadata ?? {}) as Record<string, unknown>;
  const isPlaceholder =
    media.storagePath.startsWith("fixture://") ||
    (typeof media.url === "string" && media.url.startsWith("fixture://")) ||
    meta.status === "stub" ||
    meta.placeholder === true;
  checks.push({
    id: "no_placeholder",
    ok: !isPlaceholder,
    severity: isPlaceholder ? "fail" : "info",
    message: isPlaceholder
      ? "Placeholder/stub media is not publishable"
      : "Not a placeholder URL",
  });

  // 4. Dimensions / aspect
  const w = media.width;
  const h = media.height;
  const hasDims = typeof w === "number" && typeof h === "number" && w > 0 && h > 0;
  checks.push({
    id: "dimensions",
    ok: hasDims,
    severity: hasDims ? "info" : "fail",
    message: hasDims ? `${w}×${h}` : "Missing width/height",
  });

  if (hasDims) {
    const ar = aspectOf(w, h)!;
    const band = expectedAspect(asset?.format);
    const aspectOk = ar >= band.min && ar <= band.max;
    checks.push({
      id: "aspect_ratio",
      ok: aspectOk,
      severity: aspectOk ? "info" : "warn",
      message: aspectOk
        ? `Aspect ${ar.toFixed(2)} within band`
        : `Aspect ${ar.toFixed(2)} outside preferred band [${band.min},${band.max}]`,
    });
    // Tiny images (< 16px) are failure; fixture 64px ok for tests
    const minPx = process.env.HNE_QC_MIN_PX
      ? Number(process.env.HNE_QC_MIN_PX)
      : 16;
    const sizeOk = w! >= minPx && h! >= minPx;
    checks.push({
      id: "min_size",
      ok: sizeOk,
      severity: sizeOk ? "info" : "fail",
      message: sizeOk ? "Meets minimum pixel size" : `Below min size ${minPx}px`,
    });
  }

  // 5. Obvious failure signals
  try {
    const size = fs.statSync(media.storagePath).size;
    const tooSmall = size < 50;
    checks.push({
      id: "no_obvious_failure",
      ok: !tooSmall,
      severity: tooSmall ? "fail" : "info",
      message: tooSmall
        ? `File suspiciously small (${size} bytes)`
        : `File size ${size} bytes`,
    });
  } catch {
    checks.push({
      id: "no_obvious_failure",
      ok: false,
      severity: "fail",
      message: "Could not stat media file",
    });
  }

  // 6. Concept match heuristics
  const vc = asset?.visualConcepts[0];
  const vMeta = (vc?.metadata ?? {}) as Record<string, unknown>;
  const prompt = (media.prompt || "").toLowerCase();
  const conceptBits = [
    vc?.title,
    vc?.metaphor,
    typeof vMeta.subject === "string" ? vMeta.subject : "",
    asset?.genome?.visualMetaphor,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  let conceptMatch = true;
  if (conceptBits.length > 8 && prompt.length > 8) {
    const tokens = conceptBits
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length > 3)
      .slice(0, 8);
    const hits = tokens.filter((t) => prompt.includes(t)).length;
    conceptMatch = tokens.length === 0 || hits >= Math.min(1, tokens.length);
    checks.push({
      id: "concept_match",
      ok: conceptMatch,
      severity: conceptMatch ? "info" : "warn",
      message: conceptMatch
        ? "Prompt aligns with visual concept tokens"
        : "Weak token overlap between prompt and visual concept",
    });
  } else {
    checks.push({
      id: "concept_match",
      ok: true,
      severity: "info",
      message: "Insufficient tokens for concept match — skipped",
    });
  }

  // 7. Text-safe area present in brief
  const textSafe =
    typeof vMeta.text_safe_area === "string" ||
    typeof vMeta.textSafeArea === "string";
  checks.push({
    id: "text_safe",
    ok: textSafe || !vc,
    severity: textSafe || !vc ? "info" : "warn",
    message: textSafe
      ? "text_safe_area specified on visual concept"
      : "Missing text_safe_area on visual concept",
  });

  // 8. Motif overuse
  const motifBlob = `${vc?.title ?? ""} ${vc?.metaphor ?? ""} ${prompt}`.toLowerCase();
  const recent =
    opts.recentMotifs ??
    (
      await prisma.visualConcept.findMany({
        where: asset?.pageId
          ? { contentAsset: { pageId: asset.pageId }, NOT: { id: vc?.id } }
          : vc
            ? { NOT: { id: vc.id } }
            : undefined,
        orderBy: { createdAt: "desc" },
        take: 20,
      })
    ).map((r) => `${r.title} ${r.metaphor ?? ""}`.toLowerCase());

  let motifOveruse = false;
  for (const over of OVERUSED_MOTIFS) {
    if (motifBlob.includes(over) && recent.some((r) => r.includes(over))) {
      motifOveruse = true;
      break;
    }
  }
  checks.push({
    id: "motif_overuse",
    ok: !motifOveruse,
    severity: motifOveruse ? "warn" : "info",
    message: motifOveruse
      ? "Overused motif detected relative to recent visuals"
      : "No motif overuse flagged",
  });

  // 9. Page DNA fit (soft)
  const visualMix = (asset?.page?.dna?.visualMix ?? {}) as Record<string, unknown>;
  const styles = Array.isArray(visualMix.styles)
    ? (visualMix.styles as string[])
    : [];
  const style = vc?.style ?? "";
  const dnaFit =
    styles.length === 0 || !style || styles.includes(style) || styles.some((s) => style.includes(s));
  checks.push({
    id: "page_dna_fit",
    ok: dnaFit,
    severity: dnaFit ? "info" : "warn",
    message: dnaFit
      ? "Visual universe compatible with Page DNA"
      : `Style ${style} not in Page DNA visual mix`,
  });

  // 10. Visual dedup (from prior duplicate_checks)
  const visualDup = asset?.duplicateChecks?.find(
    (d) =>
      d.verdict === "hard_duplicate" ||
      (d.visualSimilarity != null && d.visualSimilarity >= 0.9)
  );
  checks.push({
    id: "visual_dedup",
    ok: !visualDup,
    severity: visualDup ? "fail" : "info",
    message: visualDup
      ? `Visual near-duplicate (${visualDup.verdict})`
      : "No hard visual duplicate signal",
  });

  // 11. Content / visual agreement
  const caption = (() => {
    const m = (asset?.metadata ?? {}) as Record<string, unknown>;
    return typeof m.caption === "string" ? m.caption : asset?.body ?? "";
  })();
  const insightStmt = asset?.concept?.insight?.statement ?? "";
  const agreeBlob = `${caption} ${insightStmt}`.toLowerCase();
  const emotion = (asset?.genome?.primaryEmotion ?? "").toLowerCase();
  let agreement = true;
  if (emotion && prompt) {
    // soft: if emotion word appears in caption/insight, prefer related language in prompt/mood
    const mood = String(vMeta.mood ?? "").toLowerCase();
    agreement =
      mood.includes(emotion.slice(0, 4)) ||
      prompt.includes(emotion.slice(0, 4)) ||
      agreeBlob.includes(emotion.slice(0, 4)) ||
      emotion.length < 3;
  }
  checks.push({
    id: "content_visual_agreement",
    ok: agreement,
    severity: agreement ? "info" : "warn",
    message: agreement
      ? "Content and visual mood roughly agree"
      : "Possible content/visual mood mismatch",
  });

  // Verdict aggregation
  const fails = checks.filter((c) => !c.ok && c.severity === "fail");
  const warns = checks.filter((c) => !c.ok && c.severity === "warn");
  let verdict: VisualQcVerdict = "PASS";
  if (fails.length > 0) {
    verdict = fails.some((f) =>
      ["media_present", "file_readable", "no_placeholder", "visual_dedup"].includes(
        f.id
      )
    )
      ? "REJECT"
      : "REGENERATE";
    if (fails.some((f) => f.id === "min_size" || f.id === "dimensions" || f.id === "no_obvious_failure")) {
      verdict = "REJECT";
    }
  } else if (warns.length >= 3) {
    verdict = "REGENERATE";
  } else if (warns.length > 0 && motifOveruse) {
    verdict = "REGENERATE";
  }

  return finalize(verdict, checks, {
    contentAssetId,
    mediaId: media.id,
    persist: opts.persist,
  });
}

async function finalize(
  verdict: VisualQcVerdict,
  checks: VisualQcCheck[],
  ctx: { contentAssetId?: string; mediaId?: string; persist?: boolean }
): Promise<VisualQcResult> {
  const passN = checks.filter((c) => c.ok).length;
  const score = checks.length ? Math.round((passN / checks.length) * 100) : 0;
  const notes = checks
    .filter((c) => !c.ok)
    .map((c) => `${c.id}: ${c.message}`)
    .join("; ");

  const result: VisualQcResult = {
    verdict,
    checks,
    score,
    notes: notes || `All ${checks.length} checks clear`,
    mediaId: ctx.mediaId,
    contentAssetId: ctx.contentAssetId,
  };

  if (ctx.persist && ctx.mediaId) {
    const qcStatus =
      verdict === "PASS" ? "pass" : verdict === "REGENERATE" ? "regenerate" : "reject";
    await prisma.generatedMedia.update({
      where: { id: ctx.mediaId },
      data: {
        qcStatus,
        qcNotes: result.notes,
        qcDetails: {
          verdict,
          score,
          checks,
        } as Prisma.InputJsonValue,
      },
    });
  }

  if (ctx.persist && ctx.contentAssetId) {
    await prisma.qualityReview.create({
      data: {
        contentAssetId: ctx.contentAssetId,
        reviewer: "visual-qc",
        score: result.score,
        verdict: result.verdict,
        notes: result.notes,
        criteria: { checks: result.checks } as Prisma.InputJsonValue,
      },
    });
  }

  return result;
}

/** True when asset has a PASS visual QC (latest). */
export async function hasPassingVisualQc(contentAssetId: string): Promise<boolean> {
  const media = await prisma.generatedMedia.findFirst({
    where: { contentAssetId },
    orderBy: { createdAt: "desc" },
  });
  if (media?.qcStatus === "pass") return true;
  const review = await prisma.qualityReview.findFirst({
    where: { contentAssetId, reviewer: "visual-qc" },
    orderBy: { createdAt: "desc" },
  });
  return review?.verdict === "PASS";
}
