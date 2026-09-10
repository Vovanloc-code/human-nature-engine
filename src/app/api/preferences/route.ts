import { NextRequest, NextResponse } from "next/server";
import { getPreferenceSummary } from "@/engine/feedback/preferences";

/**
 * GET /api/preferences?page=the-war-within
 * Read-only preference weight summary (Phase 7).
 */
export async function GET(req: NextRequest) {
  try {
    const pageSlug =
      req.nextUrl.searchParams.get("page") ??
      req.nextUrl.searchParams.get("pageSlug") ??
      undefined;
    const pageId = req.nextUrl.searchParams.get("pageId") ?? undefined;
    const summary = await getPreferenceSummary({
      pageSlug,
      pageId: pageId ?? undefined,
    });
    return NextResponse.json({ ok: true, ...summary });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
