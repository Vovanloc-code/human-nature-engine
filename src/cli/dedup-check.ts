#!/usr/bin/env tsx
/**
 * Phase 4 CLI: Dedup Judge
 *
 * Usage:
 *   npm run dedup:check -- --asset <contentAssetId>
 *   npm run dedup:check -- --insight <insightId>
 *   npm run dedup:check -- --insight <a> --against <b>
 */
import { judgeDuplicates, judgeInsightPair } from "../agents/dedup-judge";
import { prisma } from "../db";
import { seedPhase4Prompts } from "../prompts";

function arg(name: string): string | undefined {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1) return undefined;
  return process.argv[idx + 1];
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

async function main() {
  await seedPhase4Prompts();
  const asset = arg("asset");
  const insight = arg("insight");
  const against = arg("against");

  if (!asset && !insight) {
    console.error(
      "Usage: npm run dedup:check -- --asset <id> | --insight <id> [--against <id>] [--no-persist]"
    );
    process.exit(1);
  }

  const persist = !hasFlag("no-persist");

  const result =
    insight && against
      ? await judgeInsightPair(insight, against, { persist })
      : await judgeDuplicates({
          contentAssetId: asset,
          insightId: insight,
          comparedInsightId: against,
          persist,
        });

  console.log(
    JSON.stringify(
      {
        runId: result.runId,
        contentAssetId: result.contentAssetId,
        insightId: result.insightId,
        primary: result.primary
          ? {
              verdict: result.primary.verdict,
              combined: result.primary.combined,
              similarities: result.primary.similarities,
              reason: result.primary.reason,
              duplicateCheckId: result.primary.duplicateCheckId,
              comparedToId: result.primary.comparedToId,
              comparedInsightId: result.primary.comparedInsightId,
            }
          : null,
        pairCount: result.pairs.length,
        thresholds: result.thresholds,
        provider: result.provider,
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
