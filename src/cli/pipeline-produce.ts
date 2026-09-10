#!/usr/bin/env tsx
/**
 * Phase 3 CLI: Concept → Writer → Visual Director
 *
 * Usage:
 *   npm run pipeline:produce -- --insight <id> [--page the-war-within] [--format hard_truth]
 *   npm run pipeline:produce -- --concept <id>
 */
import { runProductionPipeline } from "../engine/production/pipeline";
import { prisma } from "../db";
import type { WriterFormat } from "../agents/types";

function arg(name: string): string | undefined {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1) return undefined;
  return process.argv[idx + 1];
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

async function main() {
  const insightId = arg("insight");
  const conceptId = arg("concept");
  if (!insightId && !conceptId) {
    console.error(
      "Usage: npm run pipeline:produce -- --insight <id> | --concept <id> [--page the-war-within] [--format hard_truth] [--no-persist]"
    );
    process.exit(1);
  }

  const result = await runProductionPipeline({
    insightId,
    conceptId,
    pageSlug: arg("page") ?? "the-war-within",
    format: arg("format") as WriterFormat | undefined,
    platform: arg("platform") ?? "instagram",
    language: arg("language") ?? "en",
    persist: !hasFlag("no-persist"),
    conceptCount: arg("conceptCount") ? Number(arg("conceptCount")) : 3,
  });

  console.log(
    JSON.stringify(
      {
        runId: result.runId,
        provider: result.provider,
        insightId: result.insightId,
        conceptId: result.conceptId,
        contentAssetId: result.contentAssetId,
        genomeId: result.genomeId,
        visualConceptId: result.visualConceptId,
        draft: {
          format: result.draft.format,
          headline: result.draft.headline,
          hook: result.draft.hook,
          image_text: result.draft.image_text,
          caption: result.draft.caption?.slice(0, 160),
          cta: result.draft.cta,
        },
        visual: {
          universe: result.direction.universe,
          visual_concept: result.direction.visual_concept,
          generation_prompt: result.direction.generation_prompt.slice(0, 200),
        },
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
