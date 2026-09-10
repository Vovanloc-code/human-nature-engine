import { NextRequest, NextResponse } from "next/server";
import { getPerformanceSummary } from "@/analytics/performance";
import { getPreferenceSummary } from "@/engine/feedback/preferences";

/**
 * GET /api/performance/summary?page=the-war-within
 */
export async function GET(req: NextRequest) {
  try {
    const pageSlug =
      req.nextUrl.searchParams.get("page") ??
      req.nextUrl.searchParams.get("pageSlug") ??
      undefined;
    const pageId = req.nextUrl.searchParams.get("pageId") ?? undefined;

    const [performance, preferences] = await Promise.all([
      getPerformanceSummary({ pageSlug, pageId: pageId ?? undefined }),
      getPreferenceSummary({ pageSlug, pageId: pageId ?? undefined }),
    ]);

    return NextResponse.json({
      ok: true,
      performance,
      preferences: {
        threshold: preferences.threshold,
        totalKeys: preferences.totalKeys,
        activeKeys: preferences.activeKeys,
        weights: preferences.weights,
        byDimension: preferences.byDimension,
        note: preferences.note,
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
