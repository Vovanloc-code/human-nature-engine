#!/usr/bin/env tsx
import { searchInsights } from "../engine/discovery/insights";
import { prisma } from "../db";

function arg(name: string): string | undefined {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1) return undefined;
  return process.argv[idx + 1];
}

async function main() {
  const result = await searchInsights({
    q: arg("q"),
    status: arg("status") as any,
    primaryConflictId: arg("conflict"),
    minUniversality: arg("minUniversality")
      ? Number(arg("minUniversality"))
      : undefined,
    minDepth: arg("minDepth") ? Number(arg("minDepth")) : undefined,
    limit: arg("limit") ? Number(arg("limit")) : 20,
  });

  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
