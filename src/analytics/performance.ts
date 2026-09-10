/**
 * Performance metrics ingest + genome-dimension aggregation (Phase 7).
 * Primary signals: share rate, save rate, follow conversion, meaningful comments, link clicks.
 * Likes alone are never treated as a primary success signal.
 */

import { prisma } from "@/db";
import type { Prisma } from "@prisma/client";
import { MAX_PERF_BOOST } from "@/engine/feedback/preferences";

export const PERFORMANCE_METRICS = [
  "impressions",
  "reach",
  "likes",
  "comments",
  "shares",
  "saves",
  "follows",
  "link_clicks",
  "dwell_time",
  "video_watch_time",
  /** Optional: comments judged meaningful (manual / fixture). */
  "meaningful_comments",
] as const;

export type PerformanceMetricName = (typeof PERFORMANCE_METRICS)[number];

export type PerformanceIngestRow = {
  contentAssetId: string;
  metric: string;
  value: number;
  capturedAt?: Date | string;
  metadata?: Record<string, unknown>;
};

export type PerformanceIngestResult = {
  inserted: number;
  ids: string[];
};

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

export async function ingestPerformanceMetrics(
  rows: PerformanceIngestRow[]
): Promise<PerformanceIngestResult> {
  const ids: string[] = [];
  for (const row of rows) {
    if (!row.contentAssetId?.trim()) {
      throw new Error("contentAssetId is required");
    }
    if (!row.metric?.trim()) throw new Error("metric is required");
    if (!Number.isFinite(row.value)) throw new Error("value must be finite");

    const created = await prisma.performanceMetric.create({
      data: {
        contentAssetId: row.contentAssetId.trim(),
        metric: row.metric.trim(),
        value: row.value,
        capturedAt: row.capturedAt ? new Date(row.capturedAt) : undefined,
        metadata: (row.metadata ?? undefined) as
          | Prisma.InputJsonValue
          | undefined,
      },
    });
    ids.push(created.id);
  }
  return { inserted: ids.length, ids };
}

export type DimensionBucket = {
  dimension: "conflict" | "visual_universe" | "format";
  key: string;
  assetCount: number;
  impressions: number;
  reach: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  follows: number;
  link_clicks: number;
  dwell_time: number;
  video_watch_time: number;
  meaningful_comments: number;
  /** Primary rates (null when denominator is 0). */
  shareRate: number | null;
  saveRate: number | null;
  followConversion: number | null;
  meaningfulCommentRate: number | null;
  linkClickRate: number | null;
  /** Composite primary score (likes excluded from primary). */
  primaryScore: number;
};

function emptyBucket(
  dimension: DimensionBucket["dimension"],
  key: string
): DimensionBucket {
  return {
    dimension,
    key,
    assetCount: 0,
    impressions: 0,
    reach: 0,
    likes: 0,
    comments: 0,
    shares: 0,
    saves: 0,
    follows: 0,
    link_clicks: 0,
    dwell_time: 0,
    video_watch_time: 0,
    meaningful_comments: 0,
    shareRate: null,
    saveRate: null,
    followConversion: null,
    meaningfulCommentRate: null,
    linkClickRate: null,
    primaryScore: 0,
  };
}

function finalizeBucket(b: DimensionBucket): DimensionBucket {
  const denom = b.impressions > 0 ? b.impressions : b.reach;
  const rate = (n: number) => (denom > 0 ? n / denom : null);
  b.shareRate = rate(b.shares);
  b.saveRate = rate(b.saves);
  b.followConversion = rate(b.follows);
  b.meaningfulCommentRate = rate(b.meaningful_comments);
  b.linkClickRate = rate(b.link_clicks);
  // Primary composite — likes intentionally omitted
  const parts = [
    b.shareRate ?? 0,
    b.saveRate ?? 0,
    b.followConversion ?? 0,
    b.meaningfulCommentRate ?? 0,
    b.linkClickRate ?? 0,
  ];
  b.primaryScore = parts.reduce((a, c) => a + c, 0) / parts.length;
  return b;
}

/**
 * Aggregate ingested metrics by genome / visual / format dimensions.
 */
export async function aggregatePerformanceByGenome(opts: {
  pageId?: string;
  pageSlug?: string;
  since?: Date;
} = {}): Promise<{
  pageId: string | null;
  byConflict: DimensionBucket[];
  byVisual: DimensionBucket[];
  byFormat: DimensionBucket[];
  totals: DimensionBucket;
}> {
  let pageId = opts.pageId ?? null;
  if (!pageId && opts.pageSlug) {
    const page = await prisma.page.findUnique({
      where: { slug: opts.pageSlug },
    });
    pageId = page?.id ?? null;
  }

  const metrics = await prisma.performanceMetric.findMany({
    where: {
      ...(opts.since ? { capturedAt: { gte: opts.since } } : {}),
      ...(pageId
        ? { contentAsset: { pageId } }
        : {}),
    },
    include: {
      contentAsset: {
        include: {
          genome: true,
          visualConcepts: { orderBy: { createdAt: "desc" }, take: 1 },
        },
      },
    },
  });

  const byConflict = new Map<string, DimensionBucket>();
  const byVisual = new Map<string, DimensionBucket>();
  const byFormat = new Map<string, DimensionBucket>();
  const totals = emptyBucket("format", "_all");
  const seenAssets = new Set<string>();
  const seenConflict = new Map<string, Set<string>>();
  const seenVisual = new Map<string, Set<string>>();
  const seenFormat = new Map<string, Set<string>>();

  const bump = (
    map: Map<string, DimensionBucket>,
    seen: Map<string, Set<string>>,
    dimension: DimensionBucket["dimension"],
    key: string,
    assetId: string,
    metric: string,
    value: number
  ) => {
    if (!key) return;
    let b = map.get(key);
    if (!b) {
      b = emptyBucket(dimension, key);
      map.set(key, b);
    }
    let set = seen.get(key);
    if (!set) {
      set = new Set();
      seen.set(key, set);
    }
    if (!set.has(assetId)) {
      set.add(assetId);
      b.assetCount = set.size;
    }
    if (metric in b && typeof (b as Record<string, unknown>)[metric] === "number") {
      (b as unknown as Record<string, number>)[metric] += value;
    }
  };

  for (const row of metrics) {
    const asset = row.contentAsset;
    const assetId = asset.id;
    if (!seenAssets.has(assetId)) {
      seenAssets.add(assetId);
      totals.assetCount = seenAssets.size;
    }
    if (row.metric in totals && typeof (totals as unknown as Record<string, number>)[row.metric] === "number") {
      (totals as unknown as Record<string, number>)[row.metric] += row.value;
    }

    const conflict = asset.genome?.primaryConflict ?? "unknown";
    const vMeta = (asset.visualConcepts[0]?.metadata ?? {}) as Record<
      string,
      unknown
    >;
    const visual =
      (typeof vMeta.universe === "string" && vMeta.universe) ||
      asset.visualConcepts[0]?.style ||
      "unknown";
    const format = asset.format || "unknown";

    bump(byConflict, seenConflict, "conflict", conflict, assetId, row.metric, row.value);
    bump(byVisual, seenVisual, "visual_universe", visual, assetId, row.metric, row.value);
    bump(byFormat, seenFormat, "format", format, assetId, row.metric, row.value);
  }

  const sortPrimary = (a: DimensionBucket, b: DimensionBucket) =>
    b.primaryScore - a.primaryScore;

  return {
    pageId,
    byConflict: [...byConflict.values()].map(finalizeBucket).sort(sortPrimary),
    byVisual: [...byVisual.values()].map(finalizeBucket).sort(sortPrimary),
    byFormat: [...byFormat.values()].map(finalizeBucket).sort(sortPrimary),
    totals: finalizeBucket(totals),
  };
}

/**
 * Soft performance prior for ranking (rankScore only).
 * Uses primary rates; likes alone do not drive the boost.
 */
export function performanceOverlayBoost(
  candidate: {
    format?: string | null;
    primaryConflict?: string | null;
    visualUniverse?: string | null;
  },
  agg: {
    byConflict: DimensionBucket[];
    byVisual: DimensionBucket[];
    byFormat: DimensionBucket[];
  } | null
): number {
  if (!agg) return 0;

  const scoreFor = (
    list: DimensionBucket[],
    key: string | null | undefined
  ): number => {
    if (!key) return 0;
    const row = list.find((b) => b.key === key);
    if (!row || row.impressions + row.reach < 10) return 0;
    // Map primaryScore (typically small rates) into [-1,1]-ish via clamp
    return clamp(row.primaryScore * 8, -1, 1);
  };

  let raw = 0;
  raw += scoreFor(agg.byConflict, candidate.primaryConflict);
  raw += scoreFor(agg.byVisual, candidate.visualUniverse);
  raw += scoreFor(agg.byFormat, candidate.format);

  return clamp(raw * (MAX_PERF_BOOST / 3), -MAX_PERF_BOOST, MAX_PERF_BOOST);
}

export async function getPerformanceSummary(opts: {
  pageId?: string;
  pageSlug?: string;
} = {}) {
  const agg = await aggregatePerformanceByGenome(opts);
  return {
    ...agg,
    primarySignals: [
      "share_rate",
      "save_rate",
      "follow_conversion",
      "meaningful_comments",
      "link_clicks",
    ],
    note: "Likes are tracked but not used as a primary ranking / success signal.",
  };
}
