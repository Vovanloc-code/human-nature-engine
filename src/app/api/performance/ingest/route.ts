import { NextRequest, NextResponse } from "next/server";
import {
  ingestPerformanceMetrics,
  type PerformanceIngestRow,
} from "@/analytics/performance";

/**
 * POST /api/performance/ingest
 * Body: { metrics: PerformanceIngestRow[] } | PerformanceIngestRow | PerformanceIngestRow[]
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    let rows: PerformanceIngestRow[] = [];
    if (Array.isArray(body)) {
      rows = body;
    } else if (Array.isArray(body?.metrics)) {
      rows = body.metrics;
    } else if (body?.contentAssetId && body?.metric != null) {
      rows = [body];
    } else {
      return NextResponse.json(
        { error: "Expected metrics array or single metric row" },
        { status: 400 }
      );
    }

    const result = await ingestPerformanceMetrics(rows);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
