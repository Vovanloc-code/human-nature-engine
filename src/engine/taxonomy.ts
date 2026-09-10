import { prisma } from "@/db";

export async function getTaxonomyTree() {
  return prisma.taxonomyCategory.findMany({
    include: { nodes: { orderBy: { sortOrder: "asc" } } },
    orderBy: { sortOrder: "asc" },
  });
}

export async function countTaxonomy() {
  const [categories, nodes] = await Promise.all([
    prisma.taxonomyCategory.count(),
    prisma.taxonomyNode.count(),
  ]);
  return { categories, nodes };
}
