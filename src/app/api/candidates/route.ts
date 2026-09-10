import { NextRequest, NextResponse } from "next/server";
import { listCandidates } from "@/engine/review";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status") ?? "reviewing";
    const pageSlug = searchParams.get("page") ?? undefined;
    const limit = searchParams.get("limit")
      ? Number(searchParams.get("limit"))
      : 50;
    const candidates = await listCandidates({
      status: status.includes(",") ? status.split(",") : status,
      pageSlug,
      limit,
    });
    return NextResponse.json({ candidates });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
