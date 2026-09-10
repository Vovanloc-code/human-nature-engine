import { prisma } from "@/db";

export type CreateConceptInput = {
  insightId: string;
  title: string;
  angle?: string;
  hook?: string;
  thesis?: string;
  status?: string;
  metadata?: Record<string, unknown>;
};

export async function createConcept(input: CreateConceptInput) {
  const insight = await prisma.humanInsight.findUnique({
    where: { id: input.insightId },
  });
  if (!insight) {
    throw new Error(`Insight not found: ${input.insightId}`);
  }
  if (!input.title?.trim()) {
    throw new Error("title is required");
  }

  return prisma.concept.create({
    data: {
      insightId: input.insightId,
      title: input.title.trim(),
      angle: input.angle,
      hook: input.hook,
      thesis: input.thesis,
      status: input.status ?? "draft",
      metadata: (input.metadata ?? undefined) as any,
    },
  });
}

export async function getConcept(id: string) {
  return prisma.concept.findUnique({
    where: { id },
    include: { insight: true },
  });
}
