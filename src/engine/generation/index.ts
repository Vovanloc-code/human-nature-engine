import { prisma } from "@/db";

export type CreateContentAssetInput = {
  conceptId?: string;
  pageId?: string;
  title: string;
  format: string;
  body?: string;
  status?: string;
  metadata?: Record<string, unknown>;
};

export type CreateGenomeInput = {
  contentAssetId: string;
  primaryConflict?: string;
  secondaryConflicts?: string[];
  primaryEmotion?: string;
  secondaryEmotion?: string;
  audienceWounds?: string[];
  lenses?: string[];
  tones?: string[];
  depthLevel?: string;
  structure?: string;
  visualMetaphor?: string;
  endingType?: string;
};

export async function createContentAsset(input: CreateContentAssetInput) {
  if (!input.title?.trim()) throw new Error("title is required");
  if (!input.format?.trim()) throw new Error("format is required");

  if (input.conceptId) {
    const concept = await prisma.concept.findUnique({ where: { id: input.conceptId } });
    if (!concept) throw new Error(`Concept not found: ${input.conceptId}`);
  }

  return prisma.contentAsset.create({
    data: {
      conceptId: input.conceptId,
      pageId: input.pageId,
      title: input.title.trim(),
      format: input.format.trim(),
      body: input.body,
      status: input.status ?? "draft",
      metadata: (input.metadata ?? undefined) as any,
    },
  });
}

export async function linkGenome(input: CreateGenomeInput) {
  const asset = await prisma.contentAsset.findUnique({
    where: { id: input.contentAssetId },
  });
  if (!asset) throw new Error(`Content asset not found: ${input.contentAssetId}`);

  return prisma.contentGenome.upsert({
    where: { contentAssetId: input.contentAssetId },
    create: {
      contentAssetId: input.contentAssetId,
      primaryConflict: input.primaryConflict,
      secondaryConflicts: input.secondaryConflicts ?? undefined,
      primaryEmotion: input.primaryEmotion,
      secondaryEmotion: input.secondaryEmotion,
      audienceWounds: input.audienceWounds ?? undefined,
      lenses: input.lenses ?? undefined,
      tones: input.tones ?? undefined,
      depthLevel: input.depthLevel,
      structure: input.structure,
      visualMetaphor: input.visualMetaphor,
      endingType: input.endingType,
    },
    update: {
      primaryConflict: input.primaryConflict,
      secondaryConflicts: input.secondaryConflicts ?? undefined,
      primaryEmotion: input.primaryEmotion,
      secondaryEmotion: input.secondaryEmotion,
      audienceWounds: input.audienceWounds ?? undefined,
      lenses: input.lenses ?? undefined,
      tones: input.tones ?? undefined,
      depthLevel: input.depthLevel,
      structure: input.structure,
      visualMetaphor: input.visualMetaphor,
      endingType: input.endingType,
    },
  });
}
