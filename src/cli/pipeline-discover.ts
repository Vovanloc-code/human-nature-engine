#!/usr/bin/env tsx
/**
 * Phase 2 CLI: run Scout → Critic → optional Concept Architect.
 *
 * Usage:
 *   npm run pipeline:discover -- --area SELF [--count 8] [--concepts] [--page the-war-within]
 */
import { runDiscoveryPipeline } from "../engine/discovery/pipeline";
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
  const area = arg("area") ?? arg("taxonomyArea");
  if (!area) {
    console.error(
      "Usage: npm run pipeline:discover -- --area SELF [--count 8] [--concepts] [--page the-war-within] [--no-persist]"
    );
    process.exit(1);
  }

  const count = arg("count") ? Number(arg("count")) : 8;
  const produce = hasFlag("produce");
  const result = await runDiscoveryPipeline({
    taxonomyArea: area,
    count,
    pageSlug: arg("page"),
    persistInsights: !hasFlag("no-persist"),
    buildConcepts: hasFlag("concepts") || produce,
    conceptCount: arg("conceptCount") ? Number(arg("conceptCount")) : 5,
    persistConcepts: (hasFlag("concepts") || produce) && !hasFlag("no-persist"),
    produceContent: produce,
  });

  console.log(
    JSON.stringify(
      {
        runId: result.runId,
        provider: result.provider,
        candidates: result.candidates.length,
        approved: result.approved.length,
        rejected: result.rejected.length,
        concepts: result.concepts.map((c) => ({
          title: c.title,
          angle: c.angle,
          format: c.format,
          lens: c.lens,
        })),
        sampleApproved: result.approved.slice(0, 2).map((a) => ({
          statement: a.candidate.statement,
          total: a.critique.scores.total,
          band: a.critique.band,
          insightId: a.insightId,
        })),
        production: result.production
          ? {
              contentAssetId: result.production.contentAssetId,
              genomeId: result.production.genomeId,
              visualConceptId: result.production.visualConceptId,
              headline: result.production.draft?.headline,
              universe: result.production.direction?.universe,
            }
          : undefined,
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
