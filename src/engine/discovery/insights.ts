import { prisma } from "@/db";
import type { HumanInsight, InsightStatus, Prisma } from "@prisma/client";

export type CreateInsightInput = {
  statement: string;
  observation?: string;
  desire?: string;
  hiddenFear?: string;
  contradictoryBehavior?: string;
  cost?: string;
  primaryConflictId?: string;
  secondaryConflicts?: string[];
  universalityScore?: number;
  depthScore?: number;
  noveltyScore?: number;
  recognitionScore?: number;
  sourceType?: string;
  sourceReference?: string;
  status?: InsightStatus;
  metadata?: Record<string, unknown>;
};

export type SearchInsightsFilters = {
  q?: string;
  status?: InsightStatus | InsightStatus[];
  primaryConflictId?: string;
  minUniversality?: number;
  minDepth?: number;
  limit?: number;
  offset?: number;
};

export async function createInsight(input: CreateInsightInput): Promise<HumanInsight> {
  if (!input.statement?.trim()) {
    throw new Error("statement is required");
  }

  return prisma.humanInsight.create({
    data: {
      statement: input.statement.trim(),
      observation: input.observation,
      desire: input.desire,
      hiddenFear: input.hiddenFear,
      contradictoryBehavior: input.contradictoryBehavior,
      cost: input.cost,
      primaryConflictId: input.primaryConflictId,
      secondaryConflicts: input.secondaryConflicts ?? undefined,
      universalityScore: input.universalityScore,
      depthScore: input.depthScore,
      noveltyScore: input.noveltyScore,
      recognitionScore: input.recognitionScore,
      sourceType: input.sourceType,
      sourceReference: input.sourceReference,
      status: input.status ?? "candidate",
      metadata: (input.metadata ?? undefined) as any,
    },
  });
}

export async function searchInsights(filters: SearchInsightsFilters = {}) {
  const where: Prisma.HumanInsightWhereInput = {};

  if (filters.q) {
    where.OR = [
      { statement: { contains: filters.q, mode: "insensitive" } },
      { observation: { contains: filters.q, mode: "insensitive" } },
      { desire: { contains: filters.q, mode: "insensitive" } },
    ];
  }

  if (filters.status) {
    where.status = Array.isArray(filters.status)
      ? { in: filters.status }
      : filters.status;
  }

  if (filters.primaryConflictId) {
    where.primaryConflictId = filters.primaryConflictId;
  }

  if (filters.minUniversality != null) {
    where.universalityScore = { gte: filters.minUniversality };
  }

  if (filters.minDepth != null) {
    where.depthScore = { gte: filters.minDepth };
  }

  const limit = filters.limit ?? 50;
  const offset = filters.offset ?? 0;

  const [items, total] = await Promise.all([
    prisma.humanInsight.findMany({
      where,
      orderBy: [{ universalityScore: "desc" }, { createdAt: "desc" }],
      take: limit,
      skip: offset,
    }),
    prisma.humanInsight.count({ where }),
  ]);

  return { items, total, limit, offset };
}

export async function getInsight(id: string) {
  return prisma.humanInsight.findUnique({ where: { id } });
}
