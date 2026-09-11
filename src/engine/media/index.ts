/**
 * Phase 9 — persist generated media with first-class provenance fields.
 */
import fs from "fs";
import path from "path";
import { prisma } from "@/db";
import type { Prisma } from "@prisma/client";
import {
  generateImage,
  type GenerateImageRequest,
  type GenerateImageResult,
  isReadableImageFile,
  defaultStorageDir,
} from "@/providers/media";

export type PersistGeneratedMediaInput = {
  contentAssetId?: string;
  visualConceptId?: string;
  generation: GenerateImageResult;
  prompt: string;
  promptVersion?: string;
  negativeConstraints?: string[];
  qcStatus?: "pending" | "pass" | "regenerate" | "reject";
  metadata?: Record<string, unknown>;
};

export async function persistGeneratedMedia(input: PersistGeneratedMediaInput) {
  if (!input.generation.mediaPath || !isReadableImageFile(input.generation.mediaPath)) {
    throw new Error("Cannot persist media: file missing or unreadable");
  }

  const row = await prisma.generatedMedia.create({
    data: {
      contentAssetId: input.contentAssetId,
      visualConceptId: input.visualConceptId,
      storagePath: input.generation.mediaPath,
      url: input.generation.url,
      mimeType: input.generation.mimeType || "image/png",
      width: input.generation.width,
      height: input.generation.height,
      provider: input.generation.provider,
      model: input.generation.model,
      generationId: input.generation.generationId,
      prompt: input.prompt,
      promptVersion: input.promptVersion,
      negativeConstraints: (input.negativeConstraints ??
        undefined) as Prisma.InputJsonValue | undefined,
      qcStatus: input.qcStatus ?? "pending",
      metadata: {
        ...(input.generation.metadata ?? {}),
        ...(input.metadata ?? {}),
      } as Prisma.InputJsonValue,
    },
  });

  // Mirror onto VisualAsset when concept known (upgrade stub brief → generated image)
  if (input.visualConceptId) {
    const stubs = await prisma.visualAsset.findMany({
      where: {
        visualConceptId: input.visualConceptId,
        kind: { in: ["generation_brief", "generated_image"] },
      },
      orderBy: { createdAt: "desc" },
      take: 3,
    });
    const brief = stubs.find((s) => s.kind === "generation_brief");
    if (brief) {
      await prisma.visualAsset.update({
        where: { id: brief.id },
        data: {
          kind: "generated_image",
          url: input.generation.url ?? `/api/media/${row.id}`,
          storagePath: input.generation.mediaPath,
          mimeType: input.generation.mimeType,
          width: input.generation.width,
          height: input.generation.height,
          provider: input.generation.provider,
          model: input.generation.model,
          generationId: input.generation.generationId,
          metadata: {
            ...((brief.metadata as object) ?? {}),
            generatedMediaId: row.id,
            status: "generated",
          } as Prisma.InputJsonValue,
        },
      });
    } else {
      await prisma.visualAsset.create({
        data: {
          visualConceptId: input.visualConceptId,
          kind: "generated_image",
          url: input.generation.url ?? `/api/media/${row.id}`,
          storagePath: input.generation.mediaPath,
          mimeType: input.generation.mimeType,
          width: input.generation.width,
          height: input.generation.height,
          provider: input.generation.provider,
          model: input.generation.model,
          generationId: input.generation.generationId,
          metadata: {
            generatedMediaId: row.id,
            status: "generated",
          },
        },
      });
    }
  }

  return row;
}

export type ProduceImageForAssetOpts = {
  contentAssetId: string;
  visualConceptId?: string;
  forceFixture?: boolean;
  outputDir?: string;
  aspectRatio?: GenerateImageRequest["aspectRatio"];
};

/**
 * Visual Director brief → Image Provider → GeneratedMedia row.
 * Throws if generation fails (never fabricates live success).
 */
export async function produceImageForAsset(opts: ProduceImageForAssetOpts) {
  const asset = await prisma.contentAsset.findUnique({
    where: { id: opts.contentAssetId },
    include: {
      visualConcepts: { orderBy: { createdAt: "desc" }, take: 1 },
      genome: true,
      concept: { include: { insight: true } },
      page: { include: { dna: true } },
    },
  });
  if (!asset) throw new Error(`Content asset not found: ${opts.contentAssetId}`);

  const vc =
    (opts.visualConceptId
      ? await prisma.visualConcept.findUnique({ where: { id: opts.visualConceptId } })
      : null) ?? asset.visualConcepts[0];

  if (!vc) {
    throw new Error(
      `No visual concept for asset ${opts.contentAssetId} — run Visual Director first`
    );
  }

  const vMeta = (vc.metadata ?? {}) as Record<string, unknown>;
  const prompt =
    (typeof vMeta.generation_prompt === "string" && vMeta.generation_prompt) ||
    (typeof vMeta.generationPrompt === "string" && vMeta.generationPrompt) ||
    vc.title;
  if (!prompt || prompt.length < 8) {
    throw new Error("Visual concept missing generation_prompt");
  }

  const negativeConstraints = Array.isArray(vMeta.negative_constraints)
    ? (vMeta.negative_constraints as string[])
    : Array.isArray(vMeta.negativeConstraints)
      ? (vMeta.negativeConstraints as string[])
      : [];

  const generation = await generateImage({
    prompt,
    negativeConstraints,
    aspectRatio: opts.aspectRatio ?? "1:1",
    style: vc.style ?? undefined,
    forceFixture: opts.forceFixture,
    outputDir: opts.outputDir,
    context: {
      contentAssetId: asset.id,
      visualConceptId: vc.id,
      metaphor: vc.metaphor,
      insight: asset.concept?.insight?.statement,
    },
  });

  const media = await persistGeneratedMedia({
    contentAssetId: asset.id,
    visualConceptId: vc.id,
    generation,
    prompt,
    promptVersion: typeof vMeta.promptVersion === "string" ? vMeta.promptVersion : "vd-1",
    negativeConstraints,
  });

  return { media, generation, visualConceptId: vc.id };
}

export async function getLatestMediaForAsset(contentAssetId: string) {
  return prisma.generatedMedia.findFirst({
    where: { contentAssetId },
    orderBy: { createdAt: "desc" },
  });
}

export function publicMediaUrl(mediaId: string): string {
  return `/api/media/${mediaId}`;
}

/** Resolve storage path safely (must stay under storage/ or explicit tmp). */
export function resolveSafeMediaPath(storagePath: string): string | null {
  if (!storagePath || storagePath.includes("\0")) return null;
  const abs = path.isAbsolute(storagePath)
    ? path.normalize(storagePath)
    : path.normalize(path.join(process.cwd(), storagePath));
  const allowedRoots = [
    path.normalize(defaultStorageDir()),
    path.normalize(path.join(process.cwd(), "storage")),
    path.normalize(path.join(process.cwd(), "artifacts")),
    path.normalize("/tmp"),
  ];
  const ok = allowedRoots.some(
    (root) => abs === root || abs.startsWith(root + path.sep)
  );
  if (!ok) return null;
  if (!fs.existsSync(abs)) return null;
  return abs;
}
