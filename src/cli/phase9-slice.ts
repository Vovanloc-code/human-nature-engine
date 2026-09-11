#!/usr/bin/env tsx
import { runPhase9VerticalSlice } from "@/engine/phase9/slice";

function arg(name: string, fallback?: string): string | undefined {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx >= 0 && process.argv[idx + 1] && !process.argv[idx + 1]!.startsWith("--")) {
    return process.argv[idx + 1];
  }
  const long = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (long) return long.split("=").slice(1).join("=");
  return fallback;
}

async function main() {
  const page = arg("page", "the-war-within")!;
  const target = Number(arg("target", "5") ?? 5);
  const winners = Number(arg("winners", "1") ?? 1);
  const forceFixture = process.argv.includes("--fixture");

  const result = await runPhase9VerticalSlice({
    pageSlug: page,
    target,
    winners,
    forceFixtureImage: forceFixture,
    dryRun: true,
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        pageSlug: result.pageSlug,
        shortlist: result.shortlist.length,
        winnerId: result.winner?.contentAssetId ?? null,
        imagePath: result.artifacts.imagePath ?? null,
        previewJson: result.artifacts.previewJson,
        liveLlm: result.liveLlm,
        liveImage: result.liveImage,
        facebookDryRun: result.facebookDryRun
          ? {
              mode: result.facebookDryRun.mode,
              publishMode: result.facebookDryRun.publishMode,
              externalId: result.facebookDryRun.externalId,
            }
          : null,
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
