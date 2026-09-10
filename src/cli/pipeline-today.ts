#!/usr/bin/env tsx
/**
 * Phase 5 CLI: Daily editorial pipeline — pool → Editor rank → shortlist
 *
 * Usage:
 *   npm run pipeline:today -- --page the-war-within --target 5
 *   npm run pipeline:today -- --page the-war-within --target 12 --minPool 20
 */
import { runTodayPipeline } from "../engine/editorial";
import { prisma } from "../db";

function arg(name: string): string | undefined {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1) return undefined;
  return process.argv[idx + 1];
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

async function main() {
  const result = await runTodayPipeline({
    pageSlug: arg("page") ?? "the-war-within",
    target: arg("target") ? Number(arg("target")) : 5,
    floor: arg("floor") ? Number(arg("floor")) : undefined,
    minPool: arg("minPool") ? Number(arg("minPool")) : undefined,
    produceLimit: arg("produceLimit") ? Number(arg("produceLimit")) : undefined,
    persist: !hasFlag("no-persist"),
    markReviewing: !hasFlag("no-mark"),
  });

  console.log(
    JSON.stringify(
      {
        runId: result.runId,
        pageSlug: result.pageSlug,
        poolSize: result.poolSize,
        produced: result.produced,
        shortlist: result.editorial.shortlist.map((s) => ({
          contentAssetId: s.contentAssetId,
          title: s.title,
          verdict: s.verdict,
          total: s.scores.total,
          WHY_THIS_WAS_SELECTED: s.WHY_THIS_WAS_SELECTED,
        })),
        rejectCount: result.editorial.rejects.length,
        qualityReviewIds: result.editorial.qualityReviewIds,
      },
      null,
      2
    )
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
