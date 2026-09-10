#!/usr/bin/env tsx
/**
 * Phase 5 CLI: Editor-in-Chief ranks a candidate pool → shortlist
 *
 * Usage:
 *   npm run editor:rank -- --page the-war-within --target 5
 *   npm run editor:rank -- --assets id1,id2,id3 --target 3
 */
import { runEditorRank } from "../agents/editor-chief";
import { seedPhase5Prompts } from "../prompts";
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
  await seedPhase5Prompts();

  const assetsRaw = arg("assets");
  const contentAssetIds = assetsRaw
    ? assetsRaw.split(",").map((s) => s.trim()).filter(Boolean)
    : undefined;

  const result = await runEditorRank({
    pageSlug: arg("page") ?? "the-war-within",
    target: arg("target") ? Number(arg("target")) : 5,
    floor: arg("floor") ? Number(arg("floor")) : undefined,
    contentAssetIds,
    persist: !hasFlag("no-persist"),
    markReviewing: !hasFlag("no-mark"),
  });

  console.log(
    JSON.stringify(
      {
        runId: result.runId,
        pageSlug: result.pageSlug,
        poolSize: result.poolSize,
        target: result.target,
        floor: result.floor,
        promptVersion: result.promptVersion,
        shortlist: result.shortlist.map((s) => ({
          contentAssetId: s.contentAssetId,
          title: s.title,
          format: s.format,
          verdict: s.verdict,
          total: s.scores.total,
          rankScore: s.rankScore,
          WHY_THIS_WAS_SELECTED: s.WHY_THIS_WAS_SELECTED,
          primaryConflict: s.primaryConflict,
        })),
        rejectCount: result.rejects.length,
        qualityReviewIds: result.qualityReviewIds,
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
