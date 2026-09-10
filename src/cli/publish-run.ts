#!/usr/bin/env tsx
/**
 * CLI: publish a queue item or content asset to a platform connector.
 *
 * Examples:
 *   npm run publish:run -- --queue-id <id> --platform facebook
 *   npm run publish:run -- --asset <id> --platform fixture
 *   npm run publish:run -- --asset <id> --platform wordpress --dry-run
 */
async function main() {
  const args = process.argv.slice(2);
  const get = (flag: string) => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const has = (flag: string) => args.includes(flag);

  const queueId = get("--queue-id") ?? get("--queue");
  const assetId = get("--asset");
  const platform = get("--platform") ?? "fixture";
  const dryRun = has("--dry-run");
  const caption = get("--caption");

  if (!queueId && !assetId) {
    console.error(
      "Usage: --queue-id <id> | --asset <id> [--platform fixture|facebook|instagram|wordpress] [--dry-run]"
    );
    process.exit(1);
  }

  const { publishContent } = await import("../engine/publishing");

  const result = await publishContent({
    queueId,
    contentAssetId: assetId,
    platform,
    options: {
      dryRun: dryRun || undefined,
      caption: caption,
    },
  });

  console.log(JSON.stringify(result, null, 2));
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
