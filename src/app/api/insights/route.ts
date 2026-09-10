import { NextRequest, NextResponse } from "next/server";
import { createInsight, searchInsights } from "@/engine/discovery/insights";
import type { InsightStatus } from "@prisma/client";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const statusParam = searchParams.get("status") ?? undefined;
    const result = await searchInsights({
      q: searchParams.get("q") ?? undefined,
      status: statusParam as InsightStatus | undefined,
      primaryConflictId: searchParams.get("conflict") ?? undefined,
      minUniversality: searchParams.get("minUniversality")
        ? Number(searchParams.get("minUniversality"))
        : undefined,
      minDepth: searchParams.get("minDepth")
        ? Number(searchParams.get("minDepth"))
        : undefined,
      limit: searchParams.get("limit")
        ? Number(searchParams.get("limit"))
        : 50,
      offset: searchParams.get("offset")
        ? Number(searchParams.get("offset"))
        : 0,
    });
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const insight = await createInsight(body);
    return NextResponse.json(insight, { status: 201 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
