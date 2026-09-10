import { NextRequest, NextResponse } from "next/server";
import { listQueue } from "@/engine/review";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const items = await listQueue({
      status: searchParams.get("status") ?? undefined,
      pageSlug: searchParams.get("page") ?? undefined,
      limit: searchParams.get("limit")
        ? Number(searchParams.get("limit"))
        : 100,
    });
    return NextResponse.json({ items });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
