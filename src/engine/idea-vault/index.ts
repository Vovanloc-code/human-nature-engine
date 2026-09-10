import { prisma } from "@/db";

export type IdeaVaultMetrics = {
  total: number;
  approved: number;
  unused: number;
  used: number;
  exceptional: number;
  needs_research: number;
  rejected: number;
  retired: number;
};

/** Queryable Idea Vault metrics across human_insights (+ vault tier). */
export async function getIdeaVaultMetrics(): Promise<IdeaVaultMetrics> {
  const [
    total,
    approved,
    unused,
    used,
    needs_research,
    rejected,
    retired,
    exceptional,
  ] = await Promise.all([
    prisma.humanInsight.count(),
    prisma.humanInsight.count({ where: { status: "approved" } }),
    prisma.humanInsight.count({
      where: { status: { in: ["approved", "candidate"] } },
    }),
    prisma.humanInsight.count({ where: { status: "used" } }),
    prisma.humanInsight.count({ where: { status: "needs_research" } }),
    prisma.humanInsight.count({ where: { status: "rejected" } }),
    prisma.humanInsight.count({ where: { status: "retired" } }),
    prisma.ideaVault.count({ where: { tier: "exceptional" } }),
  ]);

  return {
    total,
    approved,
    unused,
    used,
    exceptional,
    needs_research,
    rejected,
    retired,
  };
}

export async function addToIdeaVault(insightId: string, tier = "standard", tags?: string[]) {
  return prisma.ideaVault.upsert({
    where: { insightId },
    create: {
      insightId,
      tier,
      tags: tags ?? undefined,
    },
    update: {
      tier,
      tags: tags ?? undefined,
    },
  });
}
