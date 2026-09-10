#!/usr/bin/env tsx
/**
 * CLI: ingest performance metrics (manual / fixture).
 *
 * Examples:
 *   npm run performance:ingest -- --asset <id> --metric shares --value 12
 *   npm run performance:ingest -- --fixture --asset <id>
 */
async function main() {
  const args = process.argv.slice(2);
  const get = (flag: string) => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const has = (flag: string) => args.includes(flag);

  const { ingestPerformanceMetrics } = await import(
    "../analytics/performance"
  );

  const assetId = get("--asset");
  if (!assetId) {
    console.error("Usage: --asset <contentAssetId> [--metric x --value n | --fixture]");
    process.exit(1);
  }

  if (has("--fixture")) {
    const rows = [
      { contentAssetId: assetId, metric: "impressions", value: 1000 },
      { contentAssetId: assetId, metric: "reach", value: 800 },
      { contentAssetId: assetId, metric: "likes", value: 40 },
      { contentAssetId: assetId, metric: "comments", value: 8 },
      { contentAssetId: assetId, metric: "shares", value: 25 },
      { contentAssetId: assetId, metric: "saves", value: 30 },
      { contentAssetId: assetId, metric: "follows", value: 5 },
      { contentAssetId: assetId, metric: "link_clicks", value: 12 },
      { contentAssetId: assetId, metric: "dwell_time", value: 18.5 },
      { contentAssetId: assetId, metric: "meaningful_comments", value: 4 },
    ];
    const result = await ingestPerformanceMetrics(rows);
    console.log(JSON.stringify({ ok: true, mode: "fixture", ...result }, null, 2));
    return;
  }

  const metric = get("--metric");
  const valueRaw = get("--value");
  if (!metric || valueRaw == null) {
    console.error("Provide --metric and --value, or use --fixture");
    process.exit(1);
  }
  const value = Number(valueRaw);
  const result = await ingestPerformanceMetrics([
    { contentAssetId: assetId, metric, value },
  ]);
  console.log(JSON.stringify({ ok: true, ...result }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
